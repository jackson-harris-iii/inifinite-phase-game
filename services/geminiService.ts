import { GoogleGenAI, Type } from "@google/genai";
import { Phase, RequirementType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generatePhases = async (theme: string, count: number = 10): Promise<Phase[]> => {
  // Fallback if no API key
  if (!process.env.API_KEY) {
    console.warn("No API Key found, returning standard phases.");
    return []; // Caller handles empty array by using standard
  }

  try {
    const model = "gemini-2.5-flash";
    const prompt = `Create a card game progression of ${count} phases with a "${theme}" theme. 
    Mechanics:
    - A "SET" is N cards of the same number value.
    - A "RUN" is N cards in sequential numerical order.
    - A "COLOR" is N cards of the same color.
    Make them progressively harder. Return pure JSON data.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Creative name of the phase" },
              description: { type: Type.STRING, description: "Short description like '2 Sets of 3'" },
              requirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ["SET", "RUN", "COLOR"] },
                    count: { type: Type.INTEGER, description: "Number of cards required for this part" }
                  },
                  required: ["type", "count"]
                }
              }
            },
            required: ["name", "description", "requirements"]
          }
        }
      }
    });

    if (response.text) {
      const rawPhases = JSON.parse(response.text);
      // Map to our internal Phase interface adding IDs
      return rawPhases.map((p: any, index: number) => ({
        id: index + 1,
        name: p.name,
        description: p.description,
        requirements: p.requirements.map((r: any) => ({
          type: r.type as RequirementType,
          count: r.count
        }))
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to generate phases", error);
    return [];
  }
};