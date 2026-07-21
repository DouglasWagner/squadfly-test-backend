import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  knowledgeDocuments,
  organizations,
  restrictedTopics,
} from './schema';

type SeedOrganization = {
  name: string;
  apiKey: string;
  documents: {
    title: string;
    content: string;
  }[];
  restrictedTopics: {
    name: string;
    description: string;
  }[];
};

const seedData: SeedOrganization[] = [
  {
    name: 'Organização Alpha',
    apiKey: 'alpha-test-key',
    documents: [
      {
        title: 'Política de férias',
        content:
          'Os funcionários da organização Alpha possuem 30 dias de férias por ano.',
      },
      {
        title: 'Trabalho remoto',
        content:
          'Os funcionários da organização Alpha podem trabalhar remotamente às sextas-feiras.',
      },
      {
        title: 'Plano de saúde',
        content:
          'A organização Alpha fornece plano de saúde para seus funcionários.',
      },
    ],
    restrictedTopics: [
      {
        name: 'salários',
        description: 'Informações sobre salários são restritas na Alpha.',
      },
      {
        name: 'remuneração',
        description: 'Informações sobre remuneração são restritas na Alpha.',
      },
      {
        name: 'bônus individuais',
        description: 'Informações sobre bônus individuais são restritas na Alpha.',
      },
    ],
  },
  {
    name: 'Organização Beta',
    apiKey: 'beta-test-key',
    documents: [
      {
        title: 'Política de férias',
        content:
          'Os funcionários da organização Beta possuem 20 dias de férias por ano.',
      },
      {
        title: 'Trabalho remoto',
        content:
          'Os funcionários da organização Beta podem trabalhar remotamente às terças-feiras.',
      },
      {
        title: 'Benefícios',
        content:
          'A organização Beta oferece vale alimentação para seus funcionários.',
      },
    ],
    restrictedTopics: [
      {
        name: 'clientes',
        description: 'Informações sobre clientes são restritas na Beta.',
      },
      {
        name: 'margens',
        description: 'Informações sobre margens são restritas na Beta.',
      },
      {
        name: 'faturamento',
        description: 'Informações sobre faturamento são restritas na Beta.',
      },
    ],
  },
];

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/knowledge_agent';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  await db.transaction(async (tx) => {
    for (const organization of seedData) {
      const [savedOrganization] = await tx
        .insert(organizations)
        .values({
          name: organization.name,
          apiKey: organization.apiKey,
        })
        .onConflictDoUpdate({
          target: organizations.apiKey,
          set: {
            name: organization.name,
          },
        })
        .returning({ id: organizations.id });

      await tx
        .delete(knowledgeDocuments)
        .where(eq(knowledgeDocuments.organizationId, savedOrganization.id));

      await tx
        .delete(restrictedTopics)
        .where(eq(restrictedTopics.organizationId, savedOrganization.id));

      await tx.insert(knowledgeDocuments).values(
        organization.documents.map((document) => ({
          organizationId: savedOrganization.id,
          title: document.title,
          content: document.content,
        })),
      );

      await tx.insert(restrictedTopics).values(
        organization.restrictedTopics.map((topic) => ({
          organizationId: savedOrganization.id,
          name: topic.name,
          description: topic.description,
        })),
      );
    }
  });

  await pool.end();
  console.log('Seed concluído com sucesso.');
}

main().catch((error: unknown) => {
  console.error('Erro ao executar seed:', error);
  process.exit(1);
});
