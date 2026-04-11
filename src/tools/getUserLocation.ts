import { tool, type ToolRuntime } from "langchain";
import * as z from "zod";

type AgentRuntime = ToolRuntime<unknown, { user_id: string }>;

export const getUserLocation = tool(
  (_, config: AgentRuntime) => {
    const { user_id } = config.context;
    return user_id === "1" ? "Florida" : "SF";
  },
  {
    name: "get_user_location",
    description: "Retrieve user information based on user ID",
    schema: z.object({}),
  }
);