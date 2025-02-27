import { z } from 'zod';
import { generateObject, LanguageModelUsage, NoObjectGeneratedError } from "ai";
import { getModel, getModelConfig } from "./config";

interface GenerateOptions<T> {
  model: string;
  schema: z.ZodType<T>;
  prompt?: string;
  system?: string;
  messages?: any;
}

export class ObjectGeneratorSafe {
  async generateObject<T>(options: GenerateOptions<T>) {
    const {
      model: inputModel,
      schema,
      prompt,
      system,
      messages,
    } = options;
    let model: string = inputModel;
    try {
      // Primary attempt with main model
      return await generateObject({
        model: getModel(model),
        schema,
        prompt,
        system,
        messages,
        maxTokens: getModelConfig(model).maxTokens,
        temperature: getModelConfig(model).temperature,
      });

    } catch (error) {
      // First fallback: Try manual JSON parsing of the error response
      try {
        if (NoObjectGeneratedError.isInstance(error)) {
          console.error('Object not generated according to schema, fallback to manual JSON parsing');
          const partialResponse = JSON.parse((error as any).text);
          return {
            object: partialResponse as T,
            usage: (error as any).usage,
            finishReason: 'error' as const
          };
        }
        throw error;
      } catch (parseError) {
        // Second fallback: Try with fallback model
        if (NoObjectGeneratedError.isInstance(parseError)) {
          const failedOutput = (parseError as any).text;
          console.error(`${model} failed -> trying fallback model`);
          model = 'gemini';
          return await generateObject({
            model: getModel(model),
            schema,
            prompt: `Extract the desired information from this text: \n ${failedOutput}`,
            maxTokens: getModelConfig(model).maxTokens,
            temperature: getModelConfig(model).temperature,
          });
        }
        throw error;
      }
    }
  }
} 