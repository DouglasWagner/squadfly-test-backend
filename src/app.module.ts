import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './agent/agent.controller';
import { AgentGraphService } from './agent/agent-graph.service';
import { AgentService } from './agent/agent.service';
import { DatabaseModule } from './database/database.module';
import { KnowledgeService } from './knowledge/knowledge.service';
import { LlmService } from './llm/llm.service';
import { OrganizationsService } from './organizations/organizations.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentGraphService,
    KnowledgeService,
    OrganizationsService,
    LlmService,
  ],
})
export class AppModule {}
