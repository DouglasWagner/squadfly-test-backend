# Knowledge Agent Backend

Backend em NestJS para o núcleo de uma plataforma de conhecimento organizacional. Cada organização possui documentos e tópicos restritos próprios, e consulta esse conhecimento por meio de um agente controlado com LangGraph.

O objetivo principal é responder somente com informações cadastradas para a organização atual, sem usar conhecimento externo, sem inferir dados ausentes e sem vazar contexto entre organizações.

## Stack

- NestJS
- TypeScript com `strict: true`
- PostgreSQL
- Drizzle ORM
- LangGraph para JavaScript/TypeScript
- OpenAI como LLM
- Jest
- Bruno
- Docker e Docker Compose

## Como executar com Docker

Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

Configure a chave do LLM no `.env`:

```text
OPENAI_API_KEY=
```

Suba PostgreSQL e API:

```bash
docker compose up -d --build
```

Execute as migrations explicitamente:

```bash
docker compose exec api npm run db:migrate
```

Execute o seed:

```bash
docker compose exec api npm run db:seed
```

A API ficará disponível em:

```text
http://localhost:3000
```

Para rodar os testes:

```bash
docker compose exec api npm test
```

Para parar os containers:

```bash
docker compose down
```

Para parar e remover também os dados locais do PostgreSQL:

```bash
docker compose down -v
```

Migrations e seed não rodam automaticamente ao iniciar o container. Essa decisão deixa o fluxo explícito para avaliação e evita recriar dados a cada boot.

## API

Endpoint único:

```http
POST /agent/query
X-Organization-Key: alpha-test-key
Content-Type: application/json
```

```json
{
  "question": "Quantos dias de férias os funcionários possuem?"
}
```

O cliente não envia `organizationId`. A API resolve a organização pelo header `X-Organization-Key` e usa o `organizationId` internamente no grafo.

A API Key é uma simplificação para identificação do tenant neste teste técnico. Em uma aplicação real, autenticação e autorização seriam mais robustas.

## Bruno

A coleção está em `bruno/`.

Abra a pasta `bruno` no Bruno e selecione o ambiente `Local`, que já possui:

```text
baseUrl=http://localhost:3000
alphaApiKey=alpha-test-key
betaApiKey=beta-test-key
```

A coleção documenta todos os cenários da API:

- Alpha - conhecimento disponível
- Beta - conhecimento disponível
- Alpha - conteúdo restrito
- Beta - conteúdo restrito
- Conhecimento insuficiente
- API Key inválida
- Isolamento Alpha
- Isolamento Beta

## Arquitetura

Fluxo principal:

```text
Controller
    ↓
AgentService
    ↓
LangGraph
    ↓
Services
    ↓
PostgreSQL / LLM
```

A estrutura foi mantida intencionalmente simples, com a lógica de negócio concentrada nos services do NestJS e o fluxo do agente separado no `AgentGraphService`.

Responsabilidades:

- `AgentController`: recebe request, valida DTO e delega.
- `AgentService`: resolve organização pela API Key e chama o grafo.
- `AgentGraphService`: define nodes, edges, conditional edges e compila o LangGraph uma única vez.
- `KnowledgeService`: consulta documentos e tópicos restritos no PostgreSQL.
- `OrganizationsService`: resolve a organização pelo header.
- `LlmService`: concentra chamadas à OpenAI com saída estruturada.

## Fluxo do LangGraph

```mermaid
flowchart TD
  START([START]) --> checkRestriction
  checkRestriction --> restricted{restricted?}
  restricted -- yes --> restrictedResponse[RESTRICTED]
  restrictedResponse --> END([END])
  restricted -- no --> searchKnowledge
  searchKnowledge --> found{knowledge found?}
  found -- no --> insufficientResponse[INSUFFICIENT]
  insufficientResponse --> END
  found -- yes --> generateAnswer
  generateAnswer --> finalStatus[ANSWERED ou INSUFFICIENT]
  finalStatus --> END
```

Nodes existentes:

- `checkRestriction`
- `restrictedResponse`
- `searchKnowledge`
- `insufficientResponse`
- `generateAnswer`

Conditional edges existentes:

- Depois de `checkRestriction`: segue para `restrictedResponse` ou `searchKnowledge`.
- Depois de `searchKnowledge`: segue para `insufficientResponse` ou `generateAnswer`.

O grafo é construído com `StateGraph`, `START`, `END`, nodes, edges, conditional edges, `compile` e `invoke`. Ele é compilado no construtor do `AgentGraphService`, não a cada request.

## Modelagem do banco

Tabelas principais:

### organizations

- `id`
- `name`
- `api_key`
- `created_at`

### knowledge_documents

- `id`
- `organization_id`
- `title`
- `content`
- `created_at`

### restricted_topics

- `id`
- `organization_id`
- `name`
- `description`
- `created_at`

`knowledge_documents.organization_id` e `restricted_topics.organization_id` são foreign keys para `organizations.id`.

O seed cria duas organizações:

- Alpha: `alpha-test-key`
- Beta: `beta-test-key`

O seed é seguro para desenvolvimento: ele faz upsert das organizações e recria os documentos/tópicos das organizações sem duplicar os dados principais.

## Decisões técnicas

### LangGraph

Foi usado porque o problema possui estados e caminhos explícitos: `RESTRICTED`, `INSUFFICIENT` e `ANSWERED`.

### Workflow controlado

Foi escolhido um workflow previsível em vez de um agente autônomo. O domínio exige que a aplicação saiba quando bloquear, quando buscar conhecimento e quando preferir não responder.

### PostgreSQL + Drizzle

PostgreSQL persiste organizações, documentos e tópicos restritos. Drizzle mantém schema, migrations e consultas tipadas.

### Busca textual

A busca usa uma estratégia textual simples com PostgreSQL (`ILIKE`) e sempre filtra por `organization_id` diretamente no banco. Embeddings e pgvector poderiam ser evolução futura se a base crescesse e exigisse busca semântica.

### Multi-tenancy

O isolamento é garantido assim:

1. a organização é resolvida antes do agente executar;
2. `organizationId` entra no state do LangGraph;
3. tópicos restritos são consultados com `organization_id = organizationId`;
4. documentos são consultados com `organization_id = organizationId`;
5. somente documentos recuperados da organização atual são enviados ao LLM.

Não há consulta global seguida de filtro em memória.

### Prevenção de respostas inventadas

A aplicação reduz risco de alucinação combinando:

- retrieval limitado à organização atual;
- contexto enviado ao LLM limitado aos documentos recuperados;
- prompt proibindo conhecimento externo, invenções e inferências não suportadas;
- saída estruturada com `canAnswer`;
- retorno `INSUFFICIENT` quando o contexto não for suficiente.

Isso não garante que o modelo nunca erre, mas torna o fluxo conservador: na dúvida, a aplicação prefere não responder.

## O que considerei crítico e por que testei

Foram considerados críticos:

- roteamento correto do LangGraph, porque cada caminho muda o comportamento da API;
- bloqueio de conteúdo restrito, porque uma pergunta restrita não pode acionar busca de conhecimento;
- comportamento quando falta conhecimento, porque o agente não deve inventar;
- não geração de respostas sem contexto suficiente, mesmo quando algum documento foi encontrado;
- isolamento entre organizações, porque Alpha e Beta possuem respostas diferentes para a mesma pergunta.

Testes implementados:

- pergunta restrita retorna `RESTRICTED` e não executa `searchKnowledge`;
- sem documentos relevantes retorna `INSUFFICIENT` e não executa `generateAnswer`;
- documento relevante com `canAnswer=true` retorna `ANSWERED`;
- documento encontrado com `canAnswer=false` retorna `INSUFFICIENT`;
- Alpha usa somente documento Alpha;
- Beta usa somente documento Beta;
- restrição interrompe explicitamente o grafo em `restrictedResponse`.
