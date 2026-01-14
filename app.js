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
            'HTML': /<!DOCTYPE|<html>|<\w+\s+|>|&[a-z]+;/i,
            'CSS': /[a-z-]+\s*:\s*[^;]+;|[.#][\w-]+\s*\{/i,
            'Python': /def\s+[\w]+\s*\(|import\s+[\w]+|print\s*\(|if\s+[\w]+\s*:|elif\s+:|#\s+.+/i,
            'Java': /\b(public|private|protected)\s+class\b|\bSystem\.out\.print\b|\bString\[\]\s+args\b/i,
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
        return Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0] || 'JavaScript';
    }

    function estimateBigO(code, findings, maxNesting) {
        let time = 'O(1)';
        let space = 'O(1)';

        const loopCount = findings.filter(f => f.type === 'loop').length;

        // Time Complexity Heuristics
        if (maxNesting >= 3) time = 'O(n³)';
        else if (maxNesting === 2) time = 'O(n²)';
        else if (loopCount > 0) time = 'O(n)';

        // Space Complexity Heuristics
        const dataStructures = code.match(/\[\]|new\s+Array|new\s+Map|new\s+Set|\{\}|list\(|dict\(|set\(/g);
        if (dataStructures && dataStructures.length > 5) space = 'O(n)';
        else if (dataStructures && dataStructures.length > 2) space = 'O(log n)';

        return { time, space };
    }

    function validateCode(code, language) {
        const errors = [];
        if (language === 'JavaScript' && code.trim()) {
            try {
                new Function(code);
            } catch (e) {
                let line = 'Unknown';
                // Try to extract line number from the error message or stack
                const match = e.stack ? e.stack.match(/<anonymous>:(\d+):(\d+)/) : null;
                if (match) line = match[1];

                errors.push({
                    message: e.message,
                    line: line
                });
            }
        }
        return errors;
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
        const bigO = estimateBigO(code, findings, maxNesting);

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
