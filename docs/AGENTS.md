# Mishkah Project Agent Guidelines

## DSL Atom Categories
Always use the following Mishkah DSL atom categories when creating or updating markup. Do **not** mix category responsibilities.

```javascript
var hAtoms = {
    Containers: createAtomCategory("Containers", ["div","section","article","header","footer","main","nav","aside","address"]),
    Text:       createAtomCategory("Text",       ["p","span","h1","h2","h3","h4","h5","h6","strong","em","b","i","small","mark","code","pre","blockquote","time","sup","sub","a"]),
    Lists:      createAtomCategory("Lists",      ["ul","ol","li","dl","dt","dd"]),
    Forms:      createAtomCategory("Forms",      ["form","label","button","fieldset","legend","datalist","output","progress","meter"]),
    Inputs:     createAtomCategory("Inputs",     ["input","textarea","select","option","optgroup"]),
    Media:      createAtomCategory("Media",      ["img","video","audio","source","track","picture","iframe"]),
    Tables:     createAtomCategory("Tables",     ["table","thead","tbody","tfoot","tr","th","td","caption","col","colgroup"]),
    Semantic:   createAtomCategory("Semantic",   ["details","summary","figure","figcaption","template"]),
    Embedded:   createAtomCategory("Embedded",   ["canvas","svg"]),
    SVG:        createAtomCategory("SVG",        ["svg","g","path","circle","ellipse","rect","line","polyline","polygon","text","tspan","defs","use","clipPath","mask","linearGradient","radialGradient","stop","pattern","symbol","marker","filter","feGaussianBlur","feOffset","feBlend","feColorMatrix"]),
    Misc:       createAtomCategory("Misc",       ["hr","br"])
  };
```

- Select atoms from the correct category. Do not place structural elements in text categories or vice versa.
- The default approach for any front-end view is to use the Mishkah DSL helpers provided by `Mishkah.DSL`. Raw atoms are allowed only when no component helper fits the requirement.

## Component-first workflow
- Reuse existing components from `mishkah-ui.js` whenever a UI element can appear in multiple screens. Do **not** duplicate atoms when a component already exists.
- Before starting any UI task, review the component list in `lib/component-registry.json` to confirm whether a component already exists. Extend or reuse before creating new atoms.
- When adding a new reusable UI element, implement it in `mishkah-ui.js` and update `lib/component-registry.json` with its classification so others can discover it.

## Component registry JSON
- The shared component registry lives at `lib/component-registry.json`.
- Each entry must provide the component `types` and `parents` classification. Keep the file alphabetically ordered by component name.

## Testing requirement
- After making code changes, always run `npm test` to execute the secure evaluator tests before submitting work.
