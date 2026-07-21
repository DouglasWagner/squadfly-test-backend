import { AgentGraphService } from './agent-graph.service';
import {
  INSUFFICIENT_ANSWER,
  RESTRICTED_ANSWER,
} from './agent-state';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LlmService } from '../llm/llm.service';

const alphaVacationDocument = {
  id: 'alpha-vacation-doc',
  title: 'Política de férias',
  content: 'Os funcionários da organização Alpha possuem 30 dias de férias por ano.',
};

const betaVacationDocument = {
  id: 'beta-vacation-doc',
  title: 'Política de férias',
  content: 'Os funcionários da organização Beta possuem 20 dias de férias por ano.',
};

describe('AgentGraphService', () => {
  let knowledgeService: jest.Mocked<
    Pick<KnowledgeService, 'findRestrictedTopics' | 'searchKnowledge'>
  >;
  let llmService: jest.Mocked<
    Pick<LlmService, 'classifyRestriction' | 'generateAnswer'>
  >;
  let service: AgentGraphService;

  beforeEach(() => {
    knowledgeService = {
      findRestrictedTopics: jest.fn().mockResolvedValue([]),
      searchKnowledge: jest.fn().mockResolvedValue([]),
    };
    llmService = {
      classifyRestriction: jest.fn().mockResolvedValue({ restricted: false }),
      generateAnswer: jest.fn().mockResolvedValue({
        canAnswer: false,
        answer: '',
      }),
    };
    service = new AgentGraphService(
      knowledgeService as unknown as KnowledgeService,
      llmService as unknown as LlmService,
    );
  });

  it('returns RESTRICTED and does not search knowledge when the question is restricted', async () => {
    llmService.classifyRestriction.mockResolvedValue({ restricted: true });

    const result = await service.run({
      organizationId: 'alpha-id',
      question: 'Qual é o salário do time?',
    });

    expect(result.status).toBe('RESTRICTED');
    expect(result.answer).toBe(RESTRICTED_ANSWER);
    expect(knowledgeService.searchKnowledge).not.toHaveBeenCalled();
    expect(llmService.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns INSUFFICIENT and does not generate an answer when no documents are found', async () => {
    knowledgeService.searchKnowledge.mockResolvedValue([]);

    const result = await service.run({
      organizationId: 'alpha-id',
      question: 'Existe política de dress code?',
    });

    expect(result.status).toBe('INSUFFICIENT');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
    expect(llmService.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns ANSWERED when relevant knowledge exists and the LLM can answer', async () => {
    knowledgeService.searchKnowledge.mockResolvedValue([alphaVacationDocument]);
    llmService.generateAnswer.mockResolvedValue({
      canAnswer: true,
      answer:
        'Os funcionários da organização Alpha possuem 30 dias de férias por ano.',
    });

    const result = await service.run({
      organizationId: 'alpha-id',
      question: 'Quantos dias de férias os funcionários possuem?',
    });

    expect(result.status).toBe('ANSWERED');
    expect(result.answer).toContain('30 dias');
    expect(result.documents).toEqual([alphaVacationDocument]);
  });

  it('returns INSUFFICIENT when documents exist but the LLM cannot answer safely', async () => {
    knowledgeService.searchKnowledge.mockResolvedValue([alphaVacationDocument]);
    llmService.generateAnswer.mockResolvedValue({
      canAnswer: false,
      answer: '',
    });

    const result = await service.run({
      organizationId: 'alpha-id',
      question: 'Qual é a política de licença maternidade?',
    });

    expect(result.status).toBe('INSUFFICIENT');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
  });

  it('keeps Alpha documents isolated from Beta documents', async () => {
    knowledgeService.searchKnowledge.mockImplementation(async (organizationId) =>
      organizationId === 'alpha-id'
        ? [alphaVacationDocument]
        : [betaVacationDocument],
    );
    llmService.generateAnswer.mockImplementation(async ({ documents }) => ({
      canAnswer: true,
      answer: documents[0]?.content ?? '',
    }));

    const result = await service.run({
      organizationId: 'alpha-id',
      question: 'Quantos dias de férias os funcionários possuem?',
    });

    expect(knowledgeService.searchKnowledge).toHaveBeenCalledWith(
      'alpha-id',
      'Quantos dias de férias os funcionários possuem?',
    );
    expect(llmService.generateAnswer).toHaveBeenCalledWith({
      question: 'Quantos dias de férias os funcionários possuem?',
      documents: [alphaVacationDocument],
    });
    expect(result.answer).toContain('30 dias');
    expect(result.answer).not.toContain('20 dias');
  });

  it('keeps Beta documents isolated from Alpha documents', async () => {
    knowledgeService.searchKnowledge.mockImplementation(async (organizationId) =>
      organizationId === 'beta-id'
        ? [betaVacationDocument]
        : [alphaVacationDocument],
    );
    llmService.generateAnswer.mockImplementation(async ({ documents }) => ({
      canAnswer: true,
      answer: documents[0]?.content ?? '',
    }));

    const result = await service.run({
      organizationId: 'beta-id',
      question: 'Quantos dias de férias os funcionários possuem?',
    });

    expect(knowledgeService.searchKnowledge).toHaveBeenCalledWith(
      'beta-id',
      'Quantos dias de férias os funcionários possuem?',
    );
    expect(llmService.generateAnswer).toHaveBeenCalledWith({
      question: 'Quantos dias de férias os funcionários possuem?',
      documents: [betaVacationDocument],
    });
    expect(result.answer).toContain('20 dias');
    expect(result.answer).not.toContain('30 dias');
  });

  it('stops at restrictedResponse when restriction is detected', async () => {
    llmService.classifyRestriction.mockResolvedValue({ restricted: true });

    const result = await service.run({
      organizationId: 'beta-id',
      question: 'Qual foi o faturamento do mês?',
    });

    expect(result.status).toBe('RESTRICTED');
    expect(knowledgeService.findRestrictedTopics).toHaveBeenCalledWith('beta-id');
    expect(knowledgeService.searchKnowledge).not.toHaveBeenCalled();
    expect(llmService.generateAnswer).not.toHaveBeenCalled();
  });
});
