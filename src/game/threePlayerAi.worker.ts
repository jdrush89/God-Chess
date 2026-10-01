import { chooseThreePlayerAiPlan } from "./threePlayerAi";
import type {
  ThreePlayerAction,
  ThreePlayerState,
} from "./threePlayerTypes";

interface ThreePlayerAiWorkerScope {
  onmessage:
    | ((event: MessageEvent<ThreePlayerState>) => void)
    | null;
  postMessage(value: {
    revision: number;
    plan: ThreePlayerAction[];
  }): void;
}

const scope = globalThis as unknown as ThreePlayerAiWorkerScope;

scope.onmessage = (event) => {
  scope.postMessage({
    revision: event.data.revision,
    plan: chooseThreePlayerAiPlan(event.data),
  });
};
