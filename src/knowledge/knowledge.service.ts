import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, or } from 'drizzle-orm';
import { AgentDocument } from '../agent/agent-state';
import { DATABASE, Database } from '../database/database.module';
import {
  knowledgeDocuments,
  restrictedTopics,
  RestrictedTopic,
} from '../database/schema';

@Injectable()
export class KnowledgeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findRestrictedTopics(organizationId: string): Promise<RestrictedTopic[]> {
    return this.db
      .select()
      .from(restrictedTopics)
      .where(eq(restrictedTopics.organizationId, organizationId));
  }

  async searchKnowledge(
    organizationId: string,
    question: string,
  ): Promise<AgentDocument[]> {
    const terms = this.extractSearchTerms(question);

    if (terms.length === 0) {
      return [];
    }

    const matches = terms.map((term) => {
      const pattern = `%${term}%`;

      return or(
        ilike(knowledgeDocuments.title, pattern),
        ilike(knowledgeDocuments.content, pattern),
      );
    });

    return this.db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        content: knowledgeDocuments.content,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, organizationId),
          or(...matches),
        ),
      )
      .limit(3);
  }

  private extractSearchTerms(question: string) {
    return Array.from(
      new Set(
        question
          .toLowerCase()
          .split(/[^a-z0-9áàâãéêíóôõúç]+/u)
          .map((term) => term.trim())
          .filter((term) => term.length >= 3),
      ),
    ).slice(0, 8);
  }
}
