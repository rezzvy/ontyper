export default class OnTyper {
    #context;
    #sys;
    #api;

    constructor(ops = {}) {
        if (!ops.target || !(ops.target instanceof HTMLElement)) {
            throw new TypeError("Initialization failed. A valid DOM element is required for 'target'.");
        }
        this.target = ops.target;

        if (
            ops.speed !== undefined &&
            (typeof ops.speed !== "number" || ops.speed < 0)
        ) {
            throw new TypeError("Invalid 'speed' value. It must be a positive number.");
        }
        this.speed = ops.speed || 25;

        ["onStart", "onTyping", "onFinish"].forEach((cb) => {
            if (ops[cb] !== undefined && typeof ops[cb] !== "function") {
                throw new TypeError(`Invalid callback for '${cb}'. It must be a function.`);
            }
        });

        this.onStart = ops.onStart;
        this.onTyping = ops.onTyping;
        this.onFinish = ops.onFinish;

        this.#context = {
            vars: {},
            funcs: {},
            aliases: {},
        };

        this.#sys = {
            tokenIndex: 0,
            tokens: [],
            status: "idle",
            timeout: null,
            delayTimeout: null,
            delayResolve: null,
            maxExecutions: 1000,
            executions: 0,
            currentNode: ops.target
        };

        this.#api = {};
        Object.defineProperties(this.#api, {
            tokens: {
                get: () => this.#sys.tokens,
            },
            tokenIndex: {
                get: () => this.#sys.tokenIndex,
            },
            progress: {
                get: () => {
                    const { tokenIndex, tokens } = this.#sys;
                    const progress = tokens.length ? tokenIndex / tokens.length : 0;

                    return { raw: progress, percent: `${Math.round(progress * 100)}%` };
                },
            },
        });
    }

    get api() {
        return this.#api;
    }

    isOnlyDirectives(text) {
        if (typeof text !== "string" || !text.trim()) return false;

        const tokens = this.#parseText(text);
        if (tokens.length === 0) return false;

        return tokens.every((token) => token.startsWith("[@"));
    }

    write(text) {
        if (typeof text !== "string") {
            throw new TypeError("Invalid argument for 'write'. Expected a string.");
        }

        this.#clear();
        this.#sys.tokens = this.#parseText(text);
        this.#sys.status = "typing";
        this.#runEvent("onStart");
        this.#tick();
    }

    pause() {
        if (this.#sys.status !== "typing") return;
        clearTimeout(this.#sys.timeout);
        this.#sys.status = "paused";
        this.#sys.timeout = null;
    }

    resume() {
        if (this.#sys.status !== "paused") return;
        this.#sys.status = "typing";
        this.#tick();
    }

    destroy(clearDom = true) {
        this.#clearTimers();
        this.#sys.status = "destroyed";
        this.#sys.tokens = [];
        this.#sys.tokenIndex = 0;

        if (clearDom && this.target) {
            this.target.innerHTML = "";
            this.#sys.currentNode = this.target;
        }
    }

    skip() {
        if (this.#sys.status !== "typing") return;
        if (!document.body.contains(this.target)) return;

        this.#clearTimers();
        this.#sys.status = "skipping";

        const run = async () => {
            while (this.#sys.tokenIndex < this.#sys.tokens.length) {
                if (++this.#sys.executions > this.#sys.maxExecutions) {
                    console.error("Skip aborted due to a potential infinite loop.");
                    break;
                }

                const token = this.#sys.tokens[this.#sys.tokenIndex];

                if (token.startsWith("[@")) {
                    const directive = this.#parseDirective(token);

                    let isWaitDirective =
                        directive.type === "async" || directive.type === "delay";

                    if (this.#context.aliases[directive.type]) {
                        const aliasType = this.#context.aliases[directive.type].type;
                        if (aliasType === "async") isWaitDirective = true;
                    }

                    if (isWaitDirective) {
                        this.#sys.tokenIndex += 1;
                        continue;
                    }

                    await this.#runDirective(directive);
                    this.#sys.tokenIndex += 1;
                    continue;
                }

                this.#insertTokenToDOM(token);
                this.#sys.tokenIndex += 1;
                this.#sys.executions = 0;
            }

            this.#tickFinishHandler();
        };

        run();
    }

    setVar(key, val) {
        if (typeof key !== "string" || !key.trim()) {
            throw new TypeError("Invalid variable name. 'setVar' requires a non-empty string key.");
        }

        this.#context.vars[key] = val;
    }

    setFn(key, fn) {
        if (typeof key !== "string" || !key.trim()) {
            throw new TypeError("Invalid function name. 'setFn' requires a non-empty string key.");
        }

        if (typeof fn !== "function") {
            throw new TypeError(`Invalid function provided for key '${key}'. It must be a function.`);
        }

        this.#context.funcs[key] = fn;
    }

    setFnAlias(key, functionName, type = "run") {
        if (typeof key !== "string" || !key.trim()) {
            throw new TypeError("Invalid alias name. 'setFnAlias' requires a non-empty string key.");
        }

        const reservedDirectives = [
            "speed",
            "delay",
            "var",
            "run",
            "async",
            "eval",
        ];

        if (reservedDirectives.includes(key)) {
            throw new Error(`Alias '${key}' conflicts with a built-in directive. Please choose another name.`);
        }

        if (typeof functionName !== "string" || !functionName.trim()) {
            throw new TypeError("Invalid function name. 'setFnAlias' requires a non-empty string 'functionName'.");
        }

        const validTypes = ["run", "async", "eval"];
        const resolvedType = validTypes.includes(type) ? type : "run";

        this.#context.aliases[key] = {
            fnName: functionName,
            type: resolvedType,
        };
    }

    async #tick() {
        if (this.#sys.status !== "typing") return;

        if (!document.body.contains(this.target)) {
            console.warn("Target element is no longer in the DOM.");
            this.#sys.status = "idle";
            this.#clear();
            return;
        }

        if (++this.#sys.executions > this.#sys.maxExecutions) {
            console.error("Execution stopped due to a potential infinite loop.");
            return;
        }

        if (this.#sys.tokenIndex >= this.#sys.tokens.length) {
            this.#tickFinishHandler();
            return;
        }

        if (this.#sys.tokens[this.#sys.tokenIndex].startsWith("[@")) {
            await this.#tickDirectiveContentHandler();
            return;
        }

        this.#tickTypingHandler();

        this.#sys.timeout = setTimeout(() => {
            this.#tick();
        }, this.speed);
    }

    async #tickDirectiveContentHandler() {
        const directive = this.#parseDirective(
            this.#sys.tokens[this.#sys.tokenIndex],
        );
        await this.#runDirective(directive);
        this.#sys.tokenIndex += 1;


        if (directive.type === "speed") {
            this.#sys.timeout = setTimeout(() => {
                this.#tick();
            }, this.speed);
            return
        }

        this.#tick();
    }

    #tickTypingHandler() {
        const token = this.#sys.tokens[this.#sys.tokenIndex];

        this.#insertTokenToDOM(token);

        this.#sys.tokenIndex += 1;
        this.#sys.executions = 0;
        this.#runEvent("onTyping");
    }

    #insertTokenToDOM(token) {
        if (/^<[^>]+>$/.test(token)) {
            if (/^<\//.test(token)) {
                if (this.#sys.currentNode !== this.target) {
                    this.#sys.currentNode = this.#sys.currentNode.parentNode;
                }
            } else {
                const temp = document.createElement("template");
                temp.innerHTML = token;
                const newEl = temp.content.firstChild;

                if (newEl) {
                    this.#sys.currentNode.appendChild(newEl);

                    const voidTags = ["AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"];

                    if (newEl.nodeType === 1 && !voidTags.includes(newEl.tagName.toUpperCase())) {
                        this.#sys.currentNode = newEl;
                    }
                }
            }
        } else if (token.startsWith("&") && token.endsWith(";")) {
            const temp = document.createElement("textarea");
            temp.innerHTML = token;
            this.#sys.currentNode.appendChild(document.createTextNode(temp.value));
        } else {
            this.#sys.currentNode.appendChild(document.createTextNode(token));
        }
    }

    #tickFinishHandler() {
        if (this.#sys.status === "destroyed") return;

        this.#sys.status = "idle";

        this.#clear();
        this.#runEvent("onFinish");
    }

    async #runDirective({ type, value }) {
        if (this.#sys.status !== "typing" && this.#sys.status !== "skipping") {
            return;
        }

        if (this.#context.aliases[type]) {
            const aliasInfo = this.#context.aliases[type];
            type = aliasInfo.type;
            value = value ? `${aliasInfo.fnName}(${value})` : `${aliasInfo.fnName}()`;
        }

        if (!["speed", "delay", "var", "run", "async", "eval"].includes(type)) {
            console.warn(`Unknown directive '${type}'. It will be ignored.`);
            return;
        }

        if (type === "speed") {
            if (!value) return;

            const newSpeed = Number(value);
            if (isNaN(newSpeed) || newSpeed < 0) {
                console.warn(`Invalid speed value '${value}'. Directive ignored.`);
                return;
            }
            this.speed = newSpeed;
            return;
        }

        if (type === "delay") {
            if (!value) return;

            const delayTime = Number(value);
            if (isNaN(delayTime) || delayTime < 0) {
                console.warn(`Invalid delay value '${value}'. Directive ignored.`);
                return;
            }
            await new Promise((resolve) => {
                this.#sys.delayResolve = resolve;
                this.#sys.delayTimeout = setTimeout(() => {
                    this.#sys.delayResolve = null;
                    resolve();
                }, delayTime);
            });
            return;
        }

        if (type === "var") {
            if (!value) return;
            if (!(value in this.#context.vars)) {
                console.warn(`Variable '${value}' is not defined.`);
                return;
            }
            const val = this.#unwrapDirective(this.#context.vars[value]);
            this.#injectNewToken(val);
            return;
        }

        if (type === "run" || type === "async" || type === "eval") {
            if (!value) return;

            const { fn, param, name } = this.#unwrapFn(value);

            if (typeof fn !== "function") {
                console.warn(`Function '${name || value}' is not defined or not callable.`);
                return;
            }

            try {
                if (type === "run" || type === "async") {
                    type === "run" ? fn(param) : await fn(param);
                } else {
                    const val = this.#unwrapDirective(fn(param));
                    this.#injectNewToken(val);
                }
            } catch (error) {
                console.error(`Failed to execute function '${name || value}'.`, error);
            }
        }
    }

    #clearTimers() {
        clearTimeout(this.#sys.timeout);
        clearTimeout(this.#sys.delayTimeout);

        if (this.#sys.delayResolve) {
            this.#sys.delayResolve();
            this.#sys.delayResolve = null;
        }

        this.#sys.timeout = null;
        this.#sys.delayTimeout = null;
    }

    #clear() {
        this.#clearTimers();

        this.#sys.tokenIndex = 0;
        this.#sys.executions = 0;
        this.#sys.tokens = [];
        this.#sys.currentNode = this.target;
    }

    #injectNewToken(text) {
        if (text === null || text === undefined) return;
        const tokens = this.#parseText(String(text));
        this.#sys.tokens.splice(this.#sys.tokenIndex + 1, 0, ...tokens);
    }

    #runEvent(eventName) {
        const fn = this[eventName];
        if (typeof fn !== "function") return;

        try {
            fn(this.api);
        } catch (error) {
            console.error(`Error occurred in event '${eventName}'.`, error);
        }
    }

    #unwrapDirective(token) {
        if (typeof token !== "string") return String(token || "");

        return token.replace(/\[@([^\]]+)\]/g, "$1");
    }

    #unwrapFn(value) {
        if (!value) return { fn: null, name: null, param: null };

        const match = value.match(/^(\w+)\((.*)\)$/);

        if (!match) {
            const fn = this.#context.funcs[value] ?? null;
            return { fn, name: value, param: null };
        }

        const [, fnName, rawParam] = match;
        const fn = this.#context.funcs[fnName];
        const param = rawParam?.length
            ? rawParam.replace(/^["']|["']$/g, "")
            : null;

        return { fn, name: fnName, param };
    }

    #parseText(str) {
        if (typeof str !== "string") return [];

        const openTagCount = (str.match(/\[@/g) || []).length;
        const closedTagCount = (str.match(/\[@[^\]]+\]/g) || []).length;

        if (openTagCount > closedTagCount) {
            const parts = str.split("[@");

            for (let i = 1; i < parts.length; i++) {
                if (!parts[i].includes("]")) {
                    const snippet = parts[i].substring(0, 30);
                    const ellipsis = parts[i].length > 30 ? "..." : "";

                    console.warn(`Detected an unclosed directive near "[@${snippet}${ellipsis}".`);
                }
            }
        }

        const tokens = str.match(
            /\[@[^\]]+\]|<[^>]+>|&[^;]+;|[\uD800-\uDBFF][\uDC00-\uDFFF]|./g,
        );

        return tokens || [];
    }

    #parseDirective(token) {
        if (!token || typeof token !== "string") return { type: "", value: "" };

        const content = token.slice(2, -1);
        const firstColonIndex = content.indexOf(":");

        if (firstColonIndex === -1) {
            return { type: content.trim(), value: "" };
        }

        return {
            type: content.slice(0, firstColonIndex).trim(),
            value: content.slice(firstColonIndex + 1).trim(),
        };
    }
}
