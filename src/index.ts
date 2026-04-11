import { createAgent, tool, initChatModel, type ToolRuntime, HumanMessage} from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import * as z from "zod";
import { systemPrompt } from './prompts/systemPrompt';
import { getUserLocation } from './tools/getUserLocation';
import { getWeather } from './tools/getWeather';


const main = async () => {
  return new Promise((resolve, reject) => {
     resolve(async ()=>{
       // model
       const model = await initChatModel(
         "claude-sonnet-4-6",
         { temperature: 0 }
        );
        
        // Define response format
        const responseFormat = z.object({
          punny_response: z.string(),
          weather_conditions: z.string().optional(),
        });
        
        // Set up memory
        const checkpointer = new MemorySaver();
        
        // Create agent
        const agent = createAgent({
          model,
          systemPrompt,
          responseFormat,
          checkpointer,
          tools: [getUserLocation, getWeather],
        });
        
        // Run agent
        // `thread_id` is a unique identifier for a given conversation.
        const config = {
          configurable: { thread_id: "1" },
          context: { user_id: "1" },
        };
        
        // `as any` works around a TS language-server bug where InferStateSchemaUpdate<StateSchemaFields>
        // is not simplified to {} for TState=undefined. tsc --noEmit passes cleanly.
        const response = await agent.invoke(
          { messages: [{ role: "human", content: "what is the weather outside?" }] } as any,
          config
        );
        console.log(response.structuredResponse);

        const thankYouResponse = await agent.invoke(
          { messages: [{ role: "human", content: "thank you!" }] } as any,
          config
        );
        console.log(thankYouResponse.structuredResponse);
        });
    });
}

main().then(()=>console.log("Initiated...")).catch((err)=>console.log(`Errored out ${err}`)).finally(()=>console.log("done"));