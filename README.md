# OnTyper

A directive-based typewriter for interactive web experiences.

## Overview

OnTyper lets you create dynamic typewriter effects with embedded commands (directives) that control behavior in real time.

- Control typing behavior using inline directives
- Define custom variables and functions
- Execute synchronous and asynchronous functions during typing
- Supports HTML tags

## Installation & Usage

### Installation

#### Browser

Include the script tag:

```html
<script src="https://cdn.jsdelivr.net/gh/rezzvy/ontyper@1023a49/dist/ontyper.min.js"></script>
```

```javascript
const typer = new OnTyper({ target: null });
// change null to node element
```

#### Node

Install via npm:

```bash
npm install ontyper
```

```javascript
import OnTyper from "ontyper";

const typer = new OnTyper({ target: null });
// change null to node element
```

### Usage

```javascript
typer.setFn("askName", () => {
  typer.setVar("name", prompt("What is your name?"));
});

typer.write("Hello there![@delay:500] What is your name? [@run:askName] I see...[@delay:1000], so your name is [@speed:1000][@var:name]");
```

## Examples

### Running an async function

```html
<p class="text"></p>
```

```javascript
const typer = new OnTyper({ target: document.querySelector(".text") });

typer.setFn("fetchData", async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 2000);
  });
});

typer.write("Fetching data... [@async:fetchData] Data has been fetched!");
```

### Evaluated a function value

```html
<p class="text"></p>
```

```javascript
const typer = new OnTyper({ target: document.querySelector(".text") });

typer.setFn("sayHi", (name) => {
  return `Hello ${name}`;
});

typer.write("[@eval:sayHi(Rezzvy)]");
```

### Create function alias

```html
<p class="text"></p>
```

```javascript
const typer = new OnTyper({ target: document.querySelector(".text") });

typer.setFn("alert", (msg) => {
  alert(msg);
});

typer.setFnAlias("print", "alert");

typer.write("Hold up! [@print:Stop there!]");
```

## Documentation

### `new OnTyper(options)`

Initializes a new OnTyper instance. It accepts a single configuration object.

| Property   | Type          | Default      | Description                                                           |
| :--------- | :------------ | :----------- | :-------------------------------------------------------------------- |
| `target`   | `HTMLElement` | **Required** | The DOM element where the typing effect will be rendered.             |
| `speed`    | `Number`      | `25`         | The default typing speed in milliseconds per character.               |
| `onStart`  | `Function`    | `undefined`  | Callback executed when the typing effect begins.                      |
| `onTyping` | `Function`    | `undefined`  | Callback executed immediately after a token or character is rendered. |
| `onFinish` | `Function`    | `undefined`  | Callback executed when the entire text sequence completes.            |

### API Reference

#### `write(text)`

Starts the typing effect with the provided string.
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `text` | `String` | The text containing characters, HTML tags, and directives to type out. |

#### `setVar(key, val)`

Registers a variable that can be injected into the text.
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `key` | `String` | The unique identifier for the variable. |
| `val` | `Any` | The value to substitute when `[@var:key]` is called. |

#### `setFn(key, fn)`

Registers a function that can be executed via directives.
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `key` | `String` | The unique identifier for the function. |
| `fn` | `Function`| The function to execute. |

#### `setFnAlias(key, functionName, type)`

Creates an alias for a registered function, allowing you to use a custom directive name.
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `key` | `String` | - | The custom directive name (cannot be a reserved directive). |
| `functionName`| `String` | - | The name of the previously registered function. |
| `type` | `String` | `"run"` | The execution type. Must be `"run"`, `"async"`, or `"eval"`. |

#### `pause()`

Pauses the current typing execution.

#### `resume()`

Resumes a paused typing execution.

#### `skip()`

Skips the typing effect, immediately evaluating all remaining directives and injecting the rest of the text into the DOM.

#### `destroy(clearDom)`

Destroys the current instance and clears internal timers.
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `clearDom` | `Boolean` | `true` | If true, clears the `innerHTML` of the target element. |

#### `isOnlyDirectives(text)`

Utility method to check if a provided string consists exclusively of directives.
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `text` | `String` | The text to check. Returns `true` or `false`. |

### Directive Commands

Directives are embedded inside the text using the `[@directive:value]` syntax.

| Directive   | Syntax               | Description                                                                  |
| :---------- | :------------------- | :--------------------------------------------------------------------------- |
| **`speed`** | `[@speed:ms]`        | Changes the typing speed to the specified milliseconds per character.        |
| **`delay`** | `[@delay:ms]`        | Pauses the typewriter for the specified milliseconds.                        |
| **`var`**   | `[@var:key]`         | Injects the value of a registered variable into the text.                    |
| **`run`**   | `[@run:fn(param)]`   | Synchronously executes a registered function. Accepts an optional parameter. |
| **`async`** | `[@async:fn(param)]` | Pauses typing until the registered asynchronous function resolves.           |
| **`eval`**  | `[@eval:fn(param)]`  | Executes a function and injects its return value directly into the text.     |

### The `api` Object

The `api` object provides read-only state information about the current typewriter instance. It is passed into lifecycle events (`onStart`, `onTyping`, `onFinish`) and can be accessed externally via `typer.api`.

| Property         | Type     | Description                                                                        |
| :--------------- | :------- | :--------------------------------------------------------------------------------- |
| **`tokens`**     | `Array`  | The array of parsed characters, HTML tags, and directives.                         |
| **`tokenIndex`** | `Number` | The current index being processed within the `tokens` array.                       |
| **`progress`**   | `Object` | Returns an object containing the current progress: `{ raw: 0.5, percent: "50%" }`. |

### Behavior

#### Variable Value

You can't put another variable directive inside the variable parameter like this:

```javascript
typer.setVar("name", "[@var:name]");
```

Any directive inside the var string will be unwrapped to avoid an infinite loop.

#### Reserved Alias

You can't set a function alias that is similar to any built-in directive syntax. It will throw an error:

```javascript
// This will throw an error
typer.setFnAlias("speed", "mySpeedFunc");
```

## Contributing

There's always room for improvement. Feel free to contribute!

## Licensing

The project is licensed under MIT License. Check the license file for more details.
