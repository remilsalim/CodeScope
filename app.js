document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const totalScoreEl = document.getElementById('total-score');
    const complexityRankEl = document.getElementById('complexity-rank');
    const detailsBody = document.getElementById('details-body');

    const metricLoc = document.querySelector('#metric-loc .metric-value');
    const metricFunctions = document.querySelector('#metric-functions .metric-value');
    const metricConditionals = document.querySelector('#metric-conditionals .metric-value');
    const metricLoops = document.querySelector('#metric-loops .metric-value');
    const metricNesting = document.querySelector('#metric-nesting .metric-value');

    codeInput.addEventListener('input', () => {
        const code = codeInput.value;
        const analysis = analyzeCode(code);
        updateUI(analysis);
    });

    function getLineNumber(fullText, index) {
        return fullText.substring(0, index).split('\n').length;
    }

    function analyzeCode(code) {
        if (!code.trim()) {
            return { loc: 0, functions: 0, conditionals: 0, loops: 0, maxNesting: 0, score: 0, findings: [] };
        }

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

        funcRegexes.forEach(pattern => {
            let match;
            while ((match = pattern.reg.exec(cleanCode)) !== null) {
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

        return { loc, functions: funcCount, conditionals: condCount, loops: loopCount, maxNesting, score, findings };
    }

    function updateUI(analysis) {
        metricLoc.textContent = analysis.loc;
        metricFunctions.textContent = analysis.functions;
        metricConditionals.textContent = analysis.conditionals;
        metricLoops.textContent = analysis.loops;
        metricNesting.textContent = analysis.maxNesting;

        totalScoreEl.textContent = analysis.score;

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
    }
});
