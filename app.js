document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const totalScoreEl = document.getElementById('total-score');
    const complexityRankEl = document.getElementById('complexity-rank');
    const detailsBody = document.getElementById('details-body');
    const languageBadge = document.getElementById('language-badge');
    const syntaxStatus = document.getElementById('syntax-status');
    const errorsSection = document.getElementById('errors-section');
    const errorList = document.getElementById('error-list');

    const metricLoc = document.querySelector('#metric-loc .metric-value');
    const metricFunctions = document.querySelector('#metric-functions .metric-value');
    const metricConditionals = document.querySelector('#metric-conditionals .metric-value');
    const timeComplexityEl = document.querySelector('#time-complexity .metric-value');
    const spaceComplexityEl = document.querySelector('#space-complexity .metric-value');

    codeInput.addEventListener('input', () => {
        const code = codeInput.value;
        const analysis = analyzeCode(code);
        updateUI(analysis);
    });

    function getLineNumber(fullText, index) {
        return fullText.substring(0, index).split('\n').length;
    }

    function detectLanguage(code) {
        if (!code.trim()) return 'JavaScript';

        const patterns = {
            'Java': /\bclass\s+\w+|\bpublic\s+static\s+void\s+main|\bSystem\.out\.println/i,
            'HTML': /<!DOCTYPE|<html>|<\w+\s+[^>]*>|&[a-z]+;/i,
            'CSS': /[a-z-]+\s*:\s*[^;]+;|[.#][\w-]+\s*\{/i,
            'Python': /def\s+[\w]+\s*\(|import\s+[\w]+|print\s*\(|if\s+[\w]+\s*:|elif\s+:|#\s+.+/i,
            'C++': /#include\s+<[^>]+>|\bstd::cout\b|\bint\s+main\s*\(/i,
            'PHP': /<\?php|\$[\w]+\s*=\s*|echo\s+['"]/i,
            'Go': /^package\s+[\w]+|func\s+\w+\s*\(|import\s+\("[^"]+"\)/m,
            'Ruby': /\bdef\s+[\w]+\b|require\s+['"][\w]+['"]|\bputs\b|(?:\s|^)end(?:\s|$)/m,
            'JavaScript': /\b(const|let|var|function|async|await|console\.log|import\s+.*\s+from|require\(|module\.exports)\b|=>/
        };

        const scores = {};
        for (const [lang, regex] of Object.entries(patterns)) {
            const matches = code.match(new RegExp(regex, 'gi'));
            scores[lang] = matches ? matches.length : 0;
        }

        // Return language with highest score, default to JavaScript
        const maxScore = Math.max(...Object.values(scores));
        if (maxScore === 0) return 'JavaScript'; // Default if no matches

        return Object.keys(scores).reduce((a, b) => scores[b] > scores[a] ? b : a);
    }

    function estimateBigO(code, findings) {
        let time = 'O(1)';
        let space = 'O(1)';

        // 1. Calculate Time Complexity via Nested Loops
        let maxLoopDepth = 0;
        let currentLoopDepth = 0;
        const stack = []; // Track scopes: 'loop' or 'other'

        // Tokenize broadly to find braces and loop keywords
        // We look for 'for', 'while', '{', '}' and filter out comments in cleanCode
        const tokens = code.match(/(\bfor\b|\bwhile\b|\bdo\b|\{|\})/g) || [];

        for (const token of tokens) {
            if (token === '{') {
                stack.push('block');
            } else if (token === '}') {
                const scope = stack.pop();
                if (scope === 'loop') {
                    currentLoopDepth--;
                }
            } else if (['for', 'while', 'do'].includes(token)) {
                // If we encounter a loop, we assume the NEXT brace opens it
                // This is a heuristic. A loop usually is followed by { or a single statement.
                // For simplicity, we assume standard bracing style.
                // We'll peek at the stack. If we are entering a loop, we increment.
                // Actually, a better way: When we see 'for', we increment depth temporarily?
                // No, standard block parsing:
                // If we see a loop keyword, mark it as 'pending loop'. The next '{' confirms it.
                stack.push('pending_loop');
            }
        }

        // Re-do with a distinct pass for structure
        // Simplified Logic: 
        // Track nesting level. When inside a loop, nesting level contributes to complexity.

        let nestingLevel = 0;
        let loopDepths = [0]; // Stack of loop counts at each nesting level
        let maxDepth = 0;

        // Clean code is processed, so comments are removed
        const cleanCode = code
            .replace(/\/\*[\s\S]*?\*\/|(?:\/\/.*$)/gm, '')
            .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '""');

        const regex = /[{}]|\b(for|while|foreach|map|forEach|reduce|filter)\b/g;
        let match;

        // Stack to track if the current block is a loop block
        // 0 = normal block, 1+ = loop block
        let scopeStack = [0];
        let currentComplexity = 0;

        while ((match = regex.exec(cleanCode)) !== null) {
            const token = match[0];

            if (token === '{') {
                scopeStack.push(0); // Enter new scope
            } else if (token === '}') {
                const isLoopScope = scopeStack.pop();
                if (isLoopScope > 0) {
                    currentComplexity--;
                }
            } else {
                // It's a loop keyword
                // We modify the TOP of the stack to indicate this scope IS inside a loop context
                // But wait, the loop keyword comes BEFORE the brace.
                // Heuristic: If we see a loop keyword, the NEXT '{' is a loop block.
                // We set a flag on the top of the stack? No.
                // We can assume the next '{' starts a loop.
                scopeStack[scopeStack.length - 1] = 1; // Mark current scope as "expecting loop body"
            }

            // "Actual" complexity is the sum of loop scopes in the stack
            // Wait, this is tricky with regex. 
            // Better approach: nesting level + knowing if we are IN a loop.
        }

        // Let's use the 'findings' array which already has locations!
        // Sort findings by line/index.
        // But tokens are easier.

        // Revised Stack Approach:
        let activeLoops = 0;
        let maxActiveLoops = 0;
        let braceStack = []; // Push true if it's a loop brace, false otherwise.
        let expectingLoopBrace = false;

        const tokenize = /(\bfor\b|\bwhile\b|\bforeach\b|\bmap\b|\bfilter\b|\bdo\b|\{|\})/g;
        let m;

        while ((m = tokenize.exec(cleanCode)) !== null) {
            const t = m[0];
            if (t === '}' && braceStack.length > 0) {
                const isLoop = braceStack.pop();
                if (isLoop) activeLoops--;
            } else if (t === '{') {
                if (expectingLoopBrace) {
                    activeLoops++;
                    braceStack.push(true);
                    expectingLoopBrace = false;
                } else {
                    braceStack.push(false);
                }
                maxActiveLoops = Math.max(maxActiveLoops, activeLoops);
            } else {
                // Loop keyword found
                expectingLoopBrace = true;
            }
        }

        if (maxActiveLoops === 0) time = 'O(1)';
        else if (maxActiveLoops === 1) time = 'O(n)';
        else if (maxActiveLoops === 2) time = 'O(n²)';
        else if (maxActiveLoops === 3) time = 'O(n³)';
        else time = `O(n^${maxActiveLoops})`;

        // Space Complexity
        const dataStructs = (code.match(/new\s+(Array|Map|Set|List|ArrayList|HashMap)|\[.*\]|\{.*\}/g) || []).length;
        if (dataStructs > 5) space = 'O(n)';
        else if (code.includes('recursion') || code.match(/function\s+(\w+).*\1/)) space = 'O(n) (Recursion)';

        return { time, space };
    }

    function validateCode(code, language) {
        const errors = [];
        const lines = code.split('\n');

        // Helper: Check balanced braces/parens
        function checkBalance(openChar, closeChar, name) {
            const stack = [];
            for (let i = 0; i < code.length; i++) {
                if (code[i] === openChar) stack.push(getLineNumber(code, i));
                if (code[i] === closeChar) {
                    if (stack.length === 0) {
                        errors.push({ message: `Unexpected closing ${name} '${closeChar}'`, line: getLineNumber(code, i) });
                    } else {
                        stack.pop();
                    }
                }
            }
            if (stack.length > 0) {
                errors.push({ message: `Unclosed ${name} '${openChar}'`, line: stack[0] });
            }
        }

        if (language === 'JavaScript') {
            try {
                new Function(code);
            } catch (e) {
                let line = 'Unknown';
                const match = e.stack ? e.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
                if (match) line = match[1];
                errors.push({ message: e.message, line: line });
            }
        }
        else if (['Java', 'C++', 'C#', 'PHP', 'Go', 'CSS'].includes(language)) {
            checkBalance('{', '}', 'brace');
            checkBalance('(', ')', 'parenthesis');
            checkBalance('[', ']', 'bracket');

            // Semicolon check for C-style languages (excluding Go/CSS/blocks)
            if (['Java', 'C++', 'C#', 'PHP'].includes(language)) {
                lines.forEach((line, index) => {
                    const trim = line.trim();
                    if (trim && !trim.endsWith(';') && !trim.endsWith('{') && !trim.endsWith('}') && !trim.startsWith('//') && !trim.startsWith('/*') && !trim.startsWith('*') && !trim.startsWith('#')) {
                        // Heuristic: skip if logic likely continues or is a comment
                        if (!['if', 'for', 'while', 'else', 'switch', 'case', 'default', 'try', 'catch'].some(k => trim.startsWith(k))) {
                            // Very rough check, might be noisy so we limit it
                            // errors.push({ message: "Possible missing semicolon", line: index + 1 });
                        }
                    }
                });
            }
        }
        else if (language === 'Python') {
            checkBalance('(', ')', 'parenthesis');
            checkBalance('[', ']', 'bracket');

            lines.forEach((line, index) => {
                const trim = line.trim();
                if ((trim.startsWith('def ') || trim.startsWith('class ') || trim.startsWith('if ') || trim.startsWith('elif ') || trim.startsWith('else') || trim.startsWith('for ') || trim.startsWith('while ')) && !trim.endsWith(':')) {
                    errors.push({ message: "Expected ':' at end of line", line: index + 1 });
                }
            });
        }
        else if (language === 'HTML') {
            const stack = [];
            const tagRegex = /<\/?(\w+)[^>]*>/g;
            let match;
            while ((match = tagRegex.exec(code)) !== null) {
                const tag = match[1];
                const isClosing = match[0].startsWith('</');
                const isSelfClosing = match[0].endsWith('/>') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag);

                if (isSelfClosing) continue;

                if (isClosing) {
                    if (stack.length === 0 || stack[stack.length - 1] !== tag) {
                        errors.push({ message: `Mismatched closing tag </${tag}>`, line: getLineNumber(code, match.index) });
                    } else {
                        stack.pop();
                    }
                } else {
                    stack.push(tag);
                }
            }
            if (stack.length > 0) {
                errors.push({ message: `Unclosed tag <${stack[0]}>`, line: 'Unknown' });
            }
        }

        return errors.slice(0, 5); // Limit to top 5 errors to avoid spam
    }

    function analyzeCode(code) {
        if (!code.trim()) {
            return { loc: 0, functions: 0, conditionals: 0, loops: 0, maxNesting: 0, score: 0, findings: [], language: 'JavaScript' };
        }

        const language = detectLanguage(code);
        const lines = code.split('\n').filter(line => line.trim().length > 0);
        const loc = lines.length;

        // Clean code for analysis (keep length for indexing)
        const cleanCode = code
            .replace(/\/\*[\s\S]*?\*\/|(?:\/\/.*$)/gm, match => ' '.repeat(match.length))
            .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, match => '"' + ' '.repeat(match.length - 2) + '"');

        const findings = [];

        // 1. Functions
        const funcRegexes = [
            { reg: /\bfunction\s+([\w$]+)\s*\(/g, type: 'Function', weight: 2 },
            { reg: /\bfunction\s*\(/g, type: 'Function (Anon)', weight: 2 },
            { reg: /([\w$]+)\s*[:=]\s*function\s*\(/g, type: 'Function (Assigned)', weight: 2 },
            { reg: /([\w$]+)\s*[:=]\s*\([^)]*\)\s*=>/g, type: 'Arrow Function', weight: 2 },
            { reg: /\([^)]*\)\s*=>/g, type: 'Arrow Function (Anon)', weight: 2 },
            { reg: /\b([\w$]+)\s*\([^)]*\)\s*\{/g, type: 'Method', weight: 2 }
        ];

        // Process functions with a set of matched indices to prevent double-counting
        const matchedIndices = new Set();
        funcRegexes.forEach(pattern => {
            let match;
            while ((match = pattern.reg.exec(cleanCode)) !== null) {
                if (matchedIndices.has(match.index)) continue;
                matchedIndices.add(match.index);

                findings.push({
                    type: 'function',
                    label: match[1] || pattern.type,
                    line: getLineNumber(code, match.index),
                    weight: pattern.weight
                });
            }
        });

        // 2. Conditionals
        const condRegexes = [
            { reg: /\bif\s*\(/g, label: 'if', weight: 3 },
            { reg: /\belse\b/g, label: 'else', weight: 3 },
            { reg: /\bswitch\s*\(/g, label: 'switch', weight: 3 },
            { reg: /\bcase\s+([^:]+):/g, label: match => `case ${match[1]}`, weight: 3 },
            { reg: /\?/g, label: 'ternary (?)', weight: 3 }
        ];

        condRegexes.forEach(pattern => {
            let match;
            while ((match = pattern.reg.exec(cleanCode)) !== null) {
                findings.push({
                    type: 'conditional',
                    label: typeof pattern.label === 'function' ? pattern.label(match) : pattern.label,
                    line: getLineNumber(code, match.index),
                    weight: pattern.weight
                });
            }
        });

        // 3. Loops
        const loopRegexes = [
            { reg: /\bfor\s*\(/g, label: 'for', weight: 3 },
            { reg: /\bwhile\s*\(/g, label: 'while', weight: 3 },
            { reg: /\bdo\s*\{/g, label: 'do-while', weight: 3 }
        ];

        loopRegexes.forEach(pattern => {
            let match;
            while ((match = pattern.reg.exec(cleanCode)) !== null) {
                findings.push({
                    type: 'loop',
                    label: pattern.label,
                    line: getLineNumber(code, match.index),
                    weight: pattern.weight
                });
            }
        });

        // Sort findings by line number
        findings.sort((a, b) => a.line - b.line);

        // 4. Max Nesting
        let maxNesting = 0;
        let currentNesting = 0;
        for (let i = 0; i < cleanCode.length; i++) {
            if (cleanCode[i] === '{') {
                currentNesting++;
                if (currentNesting > maxNesting) maxNesting = currentNesting;
            } else if (cleanCode[i] === '}') {
                currentNesting = Math.max(0, currentNesting - 1);
            }
        }

        const funcCount = findings.filter(f => f.type === 'function').length;
        const condCount = findings.filter(f => f.type === 'conditional').length;
        const loopCount = findings.filter(f => f.type === 'loop').length;
        const score = Math.round(
            (loc * 0.1) +
            (funcCount * 2) +
            (condCount * 3) +
            (loopCount * 3) +
            (maxNesting * 5)
        );

        const errors = validateCode(code, language);
        const bigO = estimateBigO(code, findings);

        return { loc, functions: funcCount, conditionals: condCount, loops: loopCount, maxNesting, score, findings, language, errors, bigO };
    }

    function updateUI(analysis) {
        metricLoc.textContent = analysis.loc;
        metricFunctions.textContent = analysis.functions;
        metricConditionals.textContent = analysis.conditionals;
        timeComplexityEl.textContent = analysis.bigO.time;
        spaceComplexityEl.textContent = analysis.bigO.space;

        totalScoreEl.textContent = analysis.score;
        languageBadge.textContent = analysis.language;

        // Update Table
        if (analysis.findings.length === 0) {
            detailsBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No data to display. Paste some code to see the breakdown.</td></tr>`;
        } else {
            detailsBody.innerHTML = analysis.findings.map(f => `
                <tr>
                    <td><span class="type-tag tag-${f.type}">${f.type}</span></td>
                    <td><strong>${f.label}</strong></td>
                    <td class="line-num">L${f.line}</td>
                    <td class="weight-val">+${f.weight}</td>
                </tr>
            `).join('');
        }

        // Update Rank
        let rank = 'Simple';
        let rankClass = 'rank-low';
        if (analysis.score > 100) { rank = 'Critical'; rankClass = 'rank-critical'; }
        else if (analysis.score > 50) { rank = 'High'; rankClass = 'rank-high'; }
        else if (analysis.score > 20) { rank = 'Moderate'; rankClass = 'rank-moderate'; }
        else if (analysis.score > 0) { rank = 'Simple'; rankClass = 'rank-low'; }
        else { rank = 'Wait for Input'; rankClass = ''; }

        complexityRankEl.textContent = rank;
        complexityRankEl.className = 'score-label ' + rankClass;

        // Update Errors
        if (analysis.errors && analysis.errors.length > 0) {
            syntaxStatus.textContent = 'Errors Found';
            syntaxStatus.className = 'badge error';
            errorsSection.style.display = 'block';
            errorList.innerHTML = analysis.errors.map(err => `
                <div class="error-item">
                    <span class="error-message">${err.message}</span>
                    <span class="error-loc">Detected near line: ${err.line}</span>
                </div>
            `).join('');
        } else {
            syntaxStatus.textContent = 'Clean';
            syntaxStatus.className = 'badge clean';
            errorsSection.style.display = 'none';
        }

        // Update Funny Quote
        updateFunnyQuote();
    }

    const quotes = [
        "\"It works on my machine.\"",
        "\"I don't always test my code, but when I do, I do it in production.\"",
        "\"A primary source of complexity is the inability to say no.\"",
        "\"Any code of your own that you haven't looked at for six or more months might as well have been written by someone else.\"",
        "\"Code is like humor. When you have to explain it, it’s bad.\"",
        "\"Fix the cause, not the symptom.\"",
        "\"Simplicity is the soul of efficiency.\"",
        "\"Talk is cheap. Show me the code.\"",
        "\"Deleted code is debugged code.\"",
        "\"If at first you don't succeed; call it version 1.0.\""
    ];

    function updateFunnyQuote() {
        const quoteEl = document.getElementById('funny-quote');
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        quoteEl.textContent = randomQuote;
    }
});
