import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateProductDescription = async (productName: string, category: string): Promise<string> => {
  try {
    const prompt = `
      Write a persuasive, short, and catchy product description for an affiliate marketing website.
      Product Name: ${productName}
      Category: ${category}
      
      Keep it under 60 words. Emphasize value and utility. Use a friendly, exciting tone. Do not use hashtags.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Could not generate description.";
  } catch (error) {
    console.error("Error generating description:", error);
    return "Failed to generate description due to an error.";
  }
};

export const suggestCategory = async (productName: string): Promise<string> => {
    try {
        const prompt = `Suggest a single, short category name (max 2 words) for a product named: "${productName}". Example: "Electronics", "Home Decor", "Mens Fashion". Return ONLY the category name.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        return response.text?.trim() || "General";
    } catch (e) {
        return "General";
    }
}