import { Annotation } from '@langchain/langgraph';

export type AgentStatus = 'ANSWERED' | 'RESTRICTED' | 'INSUFFICIENT';

export type AgentDocument = {
  id: string;
  title: string;
  content: string;
};

export type AgentResponse = {
  status: AgentStatus;
  answer: string;
  sources: {
    id: string;
    title: string;
  }[];
};

export const RESTRICTED_ANSWER =
  'Não posso fornecer essa informação porque ela é restrita para esta organização.';

export const INSUFFICIENT_ANSWER =
  'Não encontrei informações suficientes na base de conhecimento desta organização para responder com segurança.';

export const AgentStateAnnotation = Annotation.Root({
  organizationId: Annotation<string>(),
  question: Annotation<string>(),
  restricted: Annotation<boolean | undefined>(),
  documents: Annotation<AgentDocument[] | undefined>(),
  status: Annotation<AgentStatus | undefined>(),
  answer: Annotation<string | undefined>(),
});

export type AgentState = typeof AgentStateAnnotation.State;
export type AgentStateUpdate = typeof AgentStateAnnotation.Update;
