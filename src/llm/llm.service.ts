import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentDocument } from '../agent/agent-state';
import { RestrictedTopic } from '../database/schema';

type RestrictionResult = {
  restricted: boolean;
};

type AnswerResult = {
  canAnswer: boolean;
  answer: string;
};

@Injectable()
export class LlmService {
  private readonly openai: OpenAI | undefined;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : undefined;
  }

  async classifyRestriction(input: {
    question: string;
    topics: RestrictedTopic[];
  }): Promise<RestrictionResult> {
    if (input.topics.length === 0) {
      return { restricted: false };
    }

    const topics = input.topics
      .map((topic) => `- ${topic.name}: ${topic.description}`)
      .join('\n');

    const content = await this.askJson(
      'Você classifica perguntas. Responda somente em JSON: {"restricted": boolean}.',
      ['Tópicos restritos:', topics, '', 'Pergunta:', input.question].join('\n'),
    );

    return JSON.parse(content) as RestrictionResult;
  }

  async generateAnswer(input: {
    question: string;
    documents: AgentDocument[];
  }): Promise<AnswerResult> {
    const context = input.documents
      .map((document) => `${document.title}\n${document.content}`)
      .join('\n\n');

    const content = await this.askJson(
      [
        'Responda somente em JSON: {"canAnswer": boolean, "answer": string}.',
        'Use apenas o contexto fornecido.',
        'Se o contexto não for suficiente, retorne canAnswer=false.',
      ].join('\n'),
      ['Contexto:', context, '', 'Pergunta:', input.question].join('\n'),
    );

    return JSON.parse(content) as AnswerResult;
  }

  private async askJson(system: string, user: string) {
    if (!this.openai) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured.');
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const content = completion.choices[0]?.message.content;

      if (!content) {
        throw new Error('Empty LLM response.');
      }

      return content;
    } catch {
      throw new ServiceUnavailableException(
        'LLM request failed. Check OPENAI_API_KEY configuration.',
      );
    }
  }
}
