// The procedure workspace (weeks 7 and 8).
//
// Long division, checked one step at a time. The item already carries the full
// trace from the generator, so this view never does arithmetic to decide
// whether a step is right -- it compares against a value that 1,000 seeded
// samples have verified. That is the whole reason the trace lives in the
// generator.
//
// A step that is wrong is not skipped past: the child stays on it, with the
// hint ladder available, because the point of the week is the procedure, not
// the final number.

import { el, mount, announce } from "../engine/dom.js";
import { t } from "../engine/i18n.js";

/**
 * @param {object} item a longDivision item
 * @param {{onComplete:(correct:boolean)=>void,
 *          onStepFeedback:(msg:string, good:boolean)=>void}} handlers
 */
export function renderProcedure(item, handlers) {
  const root = el("div", {});
  // The sequence of things to answer: estimate, then per step the digit, the
  // product and the subtraction, then the final answer.
  const prompts = buildPrompts(item);
  let at = 0;
  let mistakes = 0;

  function paint() {
    // Only the steps already done, plus the one being worked on. Showing the
    // rest gives the answer away: the label "3 x 8 =" IS the answer to the
    // question above it ("how many 8s fit into 28?"), so a visible future step
    // turns the workspace into a worked solution the child copies down.
    const lines = prompts.slice(0, at + 1).map((p, i) => line(p, i));
    mount(
      root,
      el("p", {
        class: "muted",
        style: "margin:0",
        text: t("procedure.title"),
      }),
      bracket(item),
      el("div", { class: "work" }, el("div", { class: "work__frame" }, lines)),
      // Say how much is left without showing what it is.
      at + 1 < prompts.length
        ? el(
            "p",
            { class: "muted", style: "margin:8px 0 0" },
            t("procedure.stepsLeft", { n: prompts.length - at - 1 }),
          )
        : null,
    );

    const active = root.querySelector(".work__in:not([disabled])");
    if (active) active.focus({ preventScroll: true });
  }

  function line(prompt, i) {
    const state = i < at ? "done" : i === at ? "active" : "todo";

    const input = el("input", {
      class: "work__in",
      type: "text",
      inputmode: "numeric",
      pattern: "[0-9]*",
      autocomplete: "off",
      "aria-label": prompt.label,
      value: i < at ? String(prompt.answer) : "",
      disabled: i !== at,
      onKeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit(input, prompt);
        }
      },
    });

    const go = el(
      "button",
      {
        class: "btn btn--small",
        disabled: i !== at,
        onClick: () => submit(input, prompt),
      },
      t("practice.check"),
    );

    return el(
      "div",
      { class: "work__line", dataset: { state } },
      el("span", { class: "work__q", text: prompt.label }),
      input,
      i === at
        ? go
        : el("span", { "aria-hidden": "true", text: i < at ? "✓" : "" }),
    );
  }

  function submit(input, prompt) {
    const value = input.value.trim();
    if (!value) return;

    // An estimate passes anywhere in the right neighbourhood; every other step
    // is exact arithmetic and is judged as such.
    const off = Math.abs(Number(value) - Number(prompt.answer));
    if (off > (prompt.tolerance || 0)) {
      mistakes++;
      input.dataset.state = "no";
      handlers.onStepFeedback(t("procedure.stepRetry"), false);
      input.select?.();
      return;
    }

    input.dataset.state = "yes";
    handlers.onStepFeedback(t("procedure.stepCorrect"), true);
    at++;

    if (at >= prompts.length) {
      // "Correct" for the attempt log means the whole procedure was completed
      // without a wrong step. Getting there after three retries is real
      // learning, but it is not yet fluency, and the badge rule should see
      // the difference.
      handlers.onComplete(mistakes === 0);
      return;
    }
    announce(prompts[at].label);
    paint();
  }

  paint();
  return root;
}

/** The division bracket, drawn with CSS borders rather than an image. */
function bracket(item) {
  return el(
    "div",
    { class: "bracket", "aria-hidden": "true" },
    el("span", { class: "bracket__divisor", text: String(item.b) }),
    el("span", { class: "bracket__dividend", text: String(item.a) }),
  );
}

/**
 * Flatten the item's trace into the ordered list of answerable prompts.
 * Week 8 teaches "estimate, then divide", so the estimate is the first thing
 * asked -- it is part of the procedure, not a preamble to it.
 */
function buildPrompts(item) {
  const prompts = [];

  // The estimate step belongs to week 8, where the divisor has two digits and
  // "estimate, then divide" is the strategy being taught. Asking it of a
  // single-digit divisor produces "round 8 to 8", which is both pointless and
  // faintly ridiculous.
  if (item.b >= 10) {
    prompts.push({
      label:
        t("procedure.estimatePrompt", {
          divisor: item.b,
          rounded: item.estimate.roundedDivisor,
        }) +
        " " +
        t("procedure.estimateAnswer"),
      answer: item.estimate.about,
      // An estimate is an estimate: anything in the right neighbourhood passes.
      tolerance: Math.max(1, Math.round(item.estimate.about * 0.5)),
    });
  }

  for (const step of item.steps) {
    prompts.push({
      label: t("procedure.stepDigit", {
        divisor: item.b,
        working: step.workingDividend,
      }),
      answer: step.digit,
    });
    prompts.push({
      label: t("procedure.stepProduct", { digit: step.digit, divisor: item.b }),
      answer: step.product,
    });
    prompts.push({
      label: t("procedure.stepSubtract", {
        working: step.workingDividend,
        product: step.product,
      }),
      answer: step.remainder,
    });
  }

  prompts.push({ label: t("procedure.finalAnswer"), answer: item.quotient });
  if (item.remainder > 0) {
    prompts.push({
      label: t("procedure.remainderPrompt"),
      answer: item.remainder,
    });
  }

  return prompts;
}
