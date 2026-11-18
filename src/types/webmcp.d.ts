import 'react';

export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface WebMcpModelContext {
  registerTool?: (
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal }
  ) => void | Promise<void>;
  unregisterTool?: (name: string) => void | Promise<void>;
  provideContext?: (context: { tools: WebMcpToolDefinition[] }) => void | Promise<void>;
  clearContext?: () => void | Promise<void>;
}

declare global {
  interface Navigator {
    modelContext?: WebMcpModelContext;
  }

  interface Document {
    modelContext?: WebMcpModelContext;
  }
}

declare module 'react' {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: string;
  }

  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
