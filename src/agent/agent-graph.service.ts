import { Injectable } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import {
  AgentState,
  AgentStateAnnotation,
  AgentStateUpdate,
  INSUFFICIENT_ANSWER,
  RESTRICTED_ANSWER,
} from './agent-state';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LlmService } from '../llm/llm.service';

type CompiledAgentGraph = {
  invoke(input: Pick<AgentState, 'organizationId' | 'question'>): Promise<AgentState>;
};

@Injectable()
export class AgentGraphService {
  private readonly graph: CompiledAgentGraph;

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly llmService: LlmService,
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: Pick<AgentState, 'organizationId' | 'question'>) {
    return this.graph.invoke(input);
  }

  private buildGraph(): CompiledAgentGraph {
    return new StateGraph(AgentStateAnnotation)
      .addNode('checkRestriction', this.checkRestriction.bind(this))
      .addNode('restrictedResponse', this.restrictedResponse.bind(this))
      .addNode('searchKnowledge', this.searchKnowledge.bind(this))
      .addNode('insufficientResponse', this.insufficientResponse.bind(this))
      .addNode('generateAnswer', this.generateAnswer.bind(this))
      .addEdge(START, 'checkRestriction')
      .addConditionalEdges(
        'checkRestriction',
        this.routeAfterRestriction.bind(this),
        ['restrictedResponse', 'searchKnowledge'],
      )
      .addEdge('restrictedResponse', END)
      .addConditionalEdges(
        'searchKnowledge',
        this.routeAfterKnowledgeSearch.bind(this),
        ['insufficientResponse', 'generateAnswer'],
      )
      .addEdge('insufficientResponse', END)
      .addEdge('generateAnswer', END)
      .compile() as CompiledAgentGraph;
  }

  private async checkRestriction(state: AgentState): Promise<AgentStateUpdate> {
    const topics = await this.knowledgeService.findRestrictedTopics(
      state.organizationId,
    );
    const classification = await this.llmService.classifyRestriction({
      question: state.question,
      topics,
    });

    return {
      restricted: classification.restricted,
    };
  }

  private restrictedResponse(): AgentStateUpdate {
    return {
      status: 'RESTRICTED',
      answer: RESTRICTED_ANSWER,
    };
  }

  private async searchKnowledge(state: AgentState): Promise<AgentStateUpdate> {
    const documents = await this.knowledgeService.searchKnowledge(
      state.organizationId,
      state.question,
    );

    return {
      documents,
    };
  }

  private insufficientResponse(): AgentStateUpdate {
    return {
      status: 'INSUFFICIENT',
      answer: INSUFFICIENT_ANSWER,
    };
  }

  private async generateAnswer(state: AgentState): Promise<AgentStateUpdate> {
    const documents = state.documents ?? [];
    const result = await this.llmService.generateAnswer({
      question: state.question,
      documents,
    });

    if (!result.canAnswer || !result.answer.trim()) {
      return {
        status: 'INSUFFICIENT',
        answer: INSUFFICIENT_ANSWER,
      };
    }

    return {
      status: 'ANSWERED',
      answer: result.answer,
    };
  }

  private routeAfterRestriction(state: AgentState) {
    return state.restricted ? 'restrictedResponse' : 'searchKnowledge';
  }

  private routeAfterKnowledgeSearch(state: AgentState) {
    return state.documents && state.documents.length > 0
      ? 'generateAnswer'
      : 'insufficientResponse';
  }
}
