import { GameState, getAdversarialAnswer } from "./lib.js";

// Worker message handler
self.onmessage = function (event) {
  const { type, id, gameState: serializedState } = event.data;

  if (type !== "compute") {
    self.postMessage({
      type: "error",
      id,
      error: `Unknown message type: ${type}`,
    });
    return;
  }

  try {
    const gameState = GameState.deserialize(serializedState);
    const result = getAdversarialAnswer(gameState);

    self.postMessage({
      type: "result",
      id,
      result,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      error: err.message,
    });
  }
};
