import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AgentResponse,
  INSUFFICIENT_ANSWER,
} from './agent-state';
import { AgentGraphService } from './agent-graph.service';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly agentGraphService: AgentGraphService,
  ) {}

  async query(
    organizationKey: string | undefined,
    question: string,
  ): Promise<AgentResponse> {
    if (!organizationKey) {
      throw new UnauthorizedException('X-Organization-Key header is required.');
    }

    const organization =
      await this.organizationsService.findByApiKey(organizationKey);

    const state = await this.agentGraphService.run({
      organizationId: organization.id,
      question,
    });

    if (state.status === 'ANSWERED') {
      return {
        status: 'ANSWERED',
        answer: state.answer ?? INSUFFICIENT_ANSWER,
        sources: (state.documents ?? []).map((document) => ({
          id: document.id,
          title: document.title,
        })),
      };
    }

    return {
      status: state.status ?? 'INSUFFICIENT',
      answer: state.answer ?? INSUFFICIENT_ANSWER,
      sources: [],
    };
  }
}
