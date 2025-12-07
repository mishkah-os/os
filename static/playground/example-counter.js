// Curated counter examples across multiple frameworks.
window.COUNTER_EXAMPLES = [
  {
    id: 'accessible-counter',
    title: { ar: 'عداد سهل الوصول', en: 'Accessible Counter' },
    description: {
      ar: 'زر واحد يرفع العدد مع إظهار القيمة الحالية باستخدام aria-live.',
      en: 'Single-button incrementer with live region updates for screen readers.'
    },
    category: 'a11y',
    code: {
      vanilla: `const output = document.querySelector('#vanilla-count');
const button = document.querySelector('#vanilla-bump');
let count = 0;

button.addEventListener('click', () => {
  count += 1;
  output.textContent = count;
  output.setAttribute('aria-live', 'polite');
});`,
      jquery: `$(function () {
  let count = 0;
  const $output = $('#jq-count');
  $('#jq-bump').on('click', function () {
    count += 1;
    $output.text(count);
  });
});`,
      react: `import { useState } from 'react';

export default function AccessibleCounter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <p aria-live="polite">{count}</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}`,
      vue: `<template>
  <div class="counter">
    <p aria-live="polite">{{ count }}</p>
    <button @click="count++">+1</button>
  </div>
</template>
<script>
export default {
  name: 'AccessibleCounter',
  data: () => ({ count: 0 }),
};
</script>`,
      svelte: `<script>
  let count = 0;
</script>
<div class="counter">
  <p aria-live="polite">{count}</p>
  <button on:click={() => count += 1}>+1</button>
</div>`,
      alpine: `<div x-data="{ count: 0 }" class="counter">
  <p aria-live="polite" x-text="count"></p>
  <button @click="count++">+1</button>
</div>`
    }
  },
  {
    id: 'bounded-counter',
    title: { ar: 'عداد بحدود', en: 'Bounded Counter' },
    description: {
      ar: 'عداد بثلاثة أزرار مع حدود دنيا وعليا وتعطيل ذكي للأزرار.',
      en: 'Three-button counter with lower/upper bounds and smart disabling.'
    },
    category: 'state-management',
    code: {
      vanilla: `const min = 0;
const max = 10;
let value = 5;
const out = document.querySelector('#bounded-value');
const buttons = {
  dec: document.querySelector('#bounded-dec'),
  inc: document.querySelector('#bounded-inc'),
  reset: document.querySelector('#bounded-reset'),
};

function render() {
  out.textContent = value;
  buttons.dec.disabled = value <= min;
  buttons.inc.disabled = value >= max;
}

buttons.dec.addEventListener('click', () => { value = Math.max(min, value - 1); render(); });
buttons.inc.addEventListener('click', () => { value = Math.min(max, value + 1); render(); });
buttons.reset.addEventListener('click', () => { value = 5; render(); });
render();`,
      react: `import { useReducer } from 'react';

const initial = 5;
const min = 0;
const max = 10;

function reducer(state, action) {
  switch (action.type) {
    case 'inc':
      return Math.min(max, state + 1);
    case 'dec':
      return Math.max(min, state - 1);
    case 'reset':
      return initial;
    default:
      return state;
  }
}

export default function BoundedCounter() {
  const [count, dispatch] = useReducer(reducer, initial);
  return (
    <div className="counter">
      <p>{count}</p>
      <div className="stack">
        <button onClick={() => dispatch({ type: 'dec' })} disabled={count <= min}>-</button>
        <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
        <button onClick={() => dispatch({ type: 'inc' })} disabled={count >= max}>+</button>
      </div>
    </div>
  );
}`,
      vue: `<template>
  <div class="counter">
    <p>{{ value }}</p>
    <div class="stack">
      <button @click="dec" :disabled="value <= min">-</button>
      <button @click="reset">Reset</button>
      <button @click="inc" :disabled="value >= max">+</button>
    </div>
  </div>
</template>
<script>
const min = 0;
const max = 10;
const initial = 5;

export default {
  data() {
    return { value: initial, min, max };
  },
  methods: {
    dec() { this.value = Math.max(this.min, this.value - 1); },
    inc() { this.value = Math.min(this.max, this.value + 1); },
    reset() { this.value = initial; }
  }
};
</script>`,
      angular: `import { Component } from '@angular/core';

@Component({
  selector: 'bounded-counter',
  template: \`
  <div class="counter">
    <p>{{ value }}</p>
    <div class="stack">
      <button (click)="dec()" [disabled]="value <= min">-</button>
      <button (click)="reset()">Reset</button>
      <button (click)="inc()" [disabled]="value >= max">+</button>
    </div>
  </div>
  \`
})
export class BoundedCounterComponent {
  min = 0;
  max = 10;
  initial = 5;
  value = this.initial;

  dec() { this.value = Math.max(this.min, this.value - 1); }
  inc() { this.value = Math.min(this.max, this.value + 1); }
  reset() { this.value = this.initial; }
}
`,
      svelte: `<script>
  const min = 0;
  const max = 10;
  const initial = 5;
  let value = initial;
</script>
<div class="counter">
  <p>{value}</p>
  <div class="stack">
    <button on:click={() => value = Math.max(min, value - 1)} disabled={value <= min}>-</button>
    <button on:click={() => value = initial}>Reset</button>
    <button on:click={() => value = Math.min(max, value + 1)} disabled={value >= max}>+</button>
  </div>
</div>`,
      solid: `import { createSignal } from 'solid-js';

const min = 0;
const max = 10;
const initial = 5;

export default function BoundedCounter() {
  const [value, setValue] = createSignal(initial);
  return (
    <div class="counter">
      <p>{value()}</p>
      <div class="stack">
        <button onClick={() => setValue(Math.max(min, value() - 1))} disabled={value() <= min}>-</button>
        <button onClick={() => setValue(initial)}>Reset</button>
        <button onClick={() => setValue(Math.min(max, value() + 1))} disabled={value() >= max}>+</button>
      </div>
    </div>
  );
}
`
    }
  },
  {
    id: 'async-counter',
    title: { ar: 'عداد غير متزامن', en: 'Async Counter' },
    description: {
      ar: 'يؤخر التحديث لإظهار تجربة تحميل ثم يضاعف القيمة.',
      en: 'Delays updates to simulate latency before doubling the value.'
    },
    category: 'async',
    code: {
      vanilla: `let value = 1;
const output = document.querySelector('#async-value');
const button = document.querySelector('#async-trigger');
const loader = document.querySelector('#async-loader');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function handleClick() {
  loader.hidden = false;
  button.disabled = true;
  await delay(400);
  value *= 2;
  output.textContent = value;
  loader.hidden = true;
  button.disabled = false;
}

button.addEventListener('click', handleClick);
output.textContent = value;`,
      react: `import { useState } from 'react';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AsyncCounter() {
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const mutate = async () => {
    setBusy(true);
    await delay(400);
    setCount((n) => n * 2);
    setBusy(false);
  };

  return (
    <div className="counter">
      <p>{count}</p>
      <button onClick={mutate} disabled={busy}>
        {busy ? 'Working…' : 'Double'}
      </button>
    </div>
  );
}`,
      vue: `<template>
  <div class="counter">
    <p>{{ count }}</p>
    <button :disabled="busy" @click="mutate">
      {{ busy ? 'Working…' : 'Double' }}
    </button>
  </div>
</template>
<script>
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  data() {
    return { count: 1, busy: false };
  },
  methods: {
    async mutate() {
      this.busy = true;
      await delay(400);
      this.count *= 2;
      this.busy = false;
    }
  }
};
</script>`,
      svelte: `<script>
  let count = 1;
  let busy = false;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  async function mutate() {
    busy = true;
    await delay(400);
    count = count * 2;
    busy = false;
  }
</script>
<div class="counter">
  <p>{count}</p>
  <button on:click={mutate} disabled={busy}>
    {busy ? 'Working…' : 'Double'}
  </button>
</div>`,
      preact: `import { useState } from 'preact/hooks';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AsyncCounter() {
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const mutate = async () => {
    setBusy(true);
    await delay(400);
    setCount((n) => n * 2);
    setBusy(false);
  };

  return (
    <div class="counter">
      <p>{count}</p>
      <button onClick={mutate} disabled={busy}>
        {busy ? 'Working…' : 'Double'}
      </button>
    </div>
  );
}
`,
      alpine: `<div x-data="asyncCounter()" class="counter">
  <p x-text="value"></p>
  <button :disabled="busy" @click="mutate()">
    <template x-if="busy">Working…</template>
    <template x-if="!busy">Double</template>
  </button>
</div>
<script>
  function asyncCounter() {
    return {
      value: 1,
      busy: false,
      async mutate() {
        this.busy = true;
        await new Promise((r) => setTimeout(r, 400));
        this.value = this.value * 2;
        this.busy = false;
      }
    };
  }
</script>`
    }
  }
];
