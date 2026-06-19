// Pure calculator — shunting-yard parser + RPN evaluator. NO eval / Function.
// This is why `calculator` is a safe SDUI widget: arithmetic without code execution.
// Supports + - * / % ^, unary minus, parentheses, decimals. Returns a number, or
// throws on malformed input (the widget catches and shows the error).

const OPS = {
  "+": { prec: 2, assoc: "L", fn: (a, b) => a + b },
  "-": { prec: 2, assoc: "L", fn: (a, b) => a - b },
  "*": { prec: 3, assoc: "L", fn: (a, b) => a * b },
  "/": { prec: 3, assoc: "L", fn: (a, b) => a / b },
  "%": { prec: 3, assoc: "L", fn: (a, b) => a % b },
  "^": { prec: 4, assoc: "R", fn: (a, b) => Math.pow(a, b) },
};

function tokenize(expr) {
  const out = [];
  let i = 0;
  const s = String(expr).replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
    } else if (c in OPS || c === "(" || c === ")") {
      out.push({ t: c in OPS ? "op" : c, v: c });
      i++;
    } else {
      throw new Error(`bad char: ${c}`);
    }
  }
  return out;
}

export function evaluate(expr) {
  const toks = tokenize(expr);
  // shunting-yard -> RPN, handling unary minus as 0 - x
  const output = [], stack = [];
  let prev = null;
  for (const tk of toks) {
    if (tk.t === "num") {
      output.push(tk);
    } else if (tk.t === "op") {
      let op = tk.v;
      const unary = op === "-" && (prev === null || prev.t === "op" || prev.t === "(");
      if (unary) { output.push({ t: "num", v: 0 }); }
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t !== "op") break;
        const o1 = OPS[op], o2 = OPS[top.v];
        if ((o1.assoc === "L" && o1.prec <= o2.prec) || (o1.assoc === "R" && o1.prec < o2.prec)) {
          output.push(stack.pop());
        } else break;
      }
      stack.push({ t: "op", v: op });
    } else if (tk.t === "(") {
      stack.push(tk);
    } else if (tk.t === ")") {
      while (stack.length && stack[stack.length - 1].t !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("mismatched )");
      stack.pop();
    }
    prev = tk;
  }
  while (stack.length) {
    const op = stack.pop();
    if (op.t === "(") throw new Error("mismatched (");
    output.push(op);
  }
  // evaluate RPN
  const eval_stack = [];
  for (const tk of output) {
    if (tk.t === "num") eval_stack.push(tk.v);
    else {
      const b = eval_stack.pop(), a = eval_stack.pop();
      if (a === undefined || b === undefined) throw new Error("malformed expression");
      eval_stack.push(OPS[tk.v].fn(a, b));
    }
  }
  if (eval_stack.length !== 1 || !Number.isFinite(eval_stack[0])) throw new Error("malformed expression");
  return eval_stack[0];
}
