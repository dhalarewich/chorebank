export function askSecret({ input, output, question }, label) {
  if (!input.isTTY) return question(`${label}: `).then((value) => value.trim());

  output.write(`${label}: `);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (result) => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      output.write("\n");
      resolve(result);
    };
    const onData = (chunk) => {
      for (const key of Buffer.from(chunk).toString()) {
        if (key === "\r" || key === "\n") return finish(value.trim());
        if (key === "\u0003") {
          input.off("data", onData);
          input.setRawMode(wasRaw);
          return reject(new Error("Setup cancelled."));
        }
        if (key === "\b" || key === "\u007f") value = value.slice(0, -1);
        else value += key;
      }
    };
    input.on("data", onData);
  });
}
