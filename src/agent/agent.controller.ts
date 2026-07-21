import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AgentService } from './agent.service';
import { QueryAgentDto } from './dto/query-agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('query')
  async query(
    @Headers('x-organization-key') organizationKey: string | undefined,
    @Body() body: QueryAgentDto,
  ) {
    return this.agentService.query(organizationKey, body.question);
  }
}
