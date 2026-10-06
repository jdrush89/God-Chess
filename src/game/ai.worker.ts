import {
  chooseAiPlan,
  type ClassicAiWorkerRequest,
  type ClassicAiWorkerResponse,
} from "./ai";

interface ClassicAiWorkerScope {
  onmessage:
    | ((event: MessageEvent<ClassicAiWorkerRequest>) => void)
    | null;
  postMessage(value: ClassicAiWorkerResponse): void;
}

const scope = globalThis as unknown as ClassicAiWorkerScope;

scope.onmessage = (event) => {
  scope.postMessage({
    requestId: event.data.requestId,
    actions: chooseAiPlan(event.data.state),
  });
};
