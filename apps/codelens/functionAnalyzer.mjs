import { getFileExtension } from './file-extension.mjs'

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

/**
 * Extract and classify all named functions and arrow function assignments
 * from source files.
 */
export function analyzeFunctions(fileMap) {
  const allFunctions = []

  for (const [path, content] of fileMap) {
    const ext = getFileExtension(path)
    if (!CODE_EXTENSIONS.includes(ext)) continue

    const functions = extractFunctions(path, content)
    allFunctions.push(...functions)
  }

  // Build summary stats
  const byClassification = {}
  for (const fn of allFunctions) {
    if (!byClassification[fn.classification]) {
      byClassification[fn.classification] = []
    }
    byClassification[fn.classification].push(fn)
  }

  return {
    functions: allFunctions,
    byClassification,
    stats: {
      total: allFunctions.length,
      exported: allFunctions.filter(f => f.isExported).length,
      hooks: (byClassification['hook'] || []).length,
      components: (byClassification['component'] || []).length,
      handlers: (byClassification['event-handler'] || []).length,
      utilities: (byClassification['utility'] || []).length,
      apiCalls: (byClassification['api-call'] || []).length,
    },
  }
}

/**
 * Extract functions from a single file using regex patterns.
 */
function extractFunctions(filePath, content) {
  const functions = []
  const lines = content.split('\n')
  const seen = new Set()

  // Named function declarations: function name(params) { ... }
  const fnDeclRegex = /^(\s*)(export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm
  let match

  while ((match = fnDeclRegex.exec(content)) !== null) {
    const name = match[3]
    if (seen.has(name + ':' + match.index)) continue
    seen.add(name + ':' + match.index)

    const line = content.slice(0, match.index).split('\n').length
    const bodyLines = countFunctionBodyLines(content, match.index)

    functions.push({
      name,
      file: filePath,
      line,
      params: parseParams(match[4]),
      isExported: !!match[2],
      isAsync: match[0].includes('async'),
      isDefault: match[2] ? match[2].includes('default') : false,
      classification: classifyFunction(name, content, match.index),
      lineCount: bodyLines,
      type: 'function-declaration',
    })
  }

  // Arrow function assignments: const name = (...) => { ... }
  const arrowRegex = /^(\s*)(export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/gm
  while ((match = arrowRegex.exec(content)) !== null) {
    const name = match[3]
    if (seen.has(name + ':' + match.index)) continue
    seen.add(name + ':' + match.index)

    const line = content.slice(0, match.index).split('\n').length
    const bodyLines = countFunctionBodyLines(content, match.index)

    functions.push({
      name,
      file: filePath,
      line,
      params: parseParams(match[4] || match[5] || ''),
      isExported: !!match[2],
      isAsync: match[0].includes('async'),
      isDefault: match[2] ? match[2].includes('default') : false,
      classification: classifyFunction(name, content, match.index),
      lineCount: bodyLines,
      type: 'arrow-function',
    })
  }

  // Object method shorthand in exports: export default { name() { } }
  // and class methods aren't commonly the focus for React apps, skipping for simplicity

  return functions
}

/**
 * Classify a function based on its name and body content.
 */
function classifyFunction(name, fullContent, matchIndex) {
  // Event handler: handle*, on*
  if (/^(handle|on)[A-Z]/.test(name)) {
    return 'event-handler'
  }

  // Custom hook: use*
  if (/^use[A-Z]/.test(name)) {
    return 'hook'
  }

  // Component: starts with uppercase and returns JSX
  if (/^[A-Z]/.test(name)) {
    // Check if function body contains JSX return
    const bodySnippet = extractBodySnippet(fullContent, matchIndex, 500)
    if (bodySnippet && (
      bodySnippet.includes('return (') ||
      bodySnippet.includes('return <') ||
      bodySnippet.includes('=> (') ||
      bodySnippet.includes('=> <') ||
      /<\w+[\s/>]/.test(bodySnippet)
    )) {
      return 'component'
    }
    return 'component' // Uppercase functions in React are usually components
  }

  // API call: contains fetch, axios, or API-related patterns
  const bodySnippet = extractBodySnippet(fullContent, matchIndex, 300)
  if (bodySnippet && (
    bodySnippet.includes('fetch(') ||
    bodySnippet.includes('axios.') ||
    bodySnippet.includes('axios(') ||
    bodySnippet.includes('.get(') ||
    bodySnippet.includes('.post(') ||
    bodySnippet.includes('.put(') ||
    bodySnippet.includes('.delete(') ||
    /api|endpoint|request/i.test(name)
  )) {
    return 'api-call'
  }

  // Default: utility
  return 'utility'
}

/**
 * Parse parameter string into an array of parameter names.
 */
function parseParams(paramString) {
  if (!paramString || !paramString.trim()) return []

  return paramString
    .split(',')
    .map(p => {
      // Handle destructured params, default values, type annotations
      let param = p.trim()
      // Remove type annotations (TypeScript)
      param = param.replace(/:\s*[^,=]+/, '')
      // Remove default values
      param = param.replace(/\s*=\s*.*$/, '')
      // Handle destructured: { a, b } -> { a, b }
      return param.trim()
    })
    .filter(Boolean)
}

/**
 * Count lines in a function body by tracking brace depth.
 */
function countFunctionBodyLines(content, startIndex) {
  let depth = 0
  let started = false
  let lineCount = 0
  let i = startIndex

  while (i < content.length) {
    const char = content[i]

    if (char === '{' || char === '(') {
      if (!started && char === '{') started = true
      if (started) depth++
    } else if (char === '}' || char === ')') {
      if (started) {
        depth--
        if (depth === 0) break
      }
    } else if (char === '\n' && started) {
      lineCount++
    }

    // Skip strings to avoid counting braces inside them
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(content, i)
      continue
    }

    i++
  }

  return Math.max(lineCount, 1)
}

/**
 * Skip past a quoted string.
 */
function skipString(content, startIndex) {
  const quote = content[startIndex]
  let i = startIndex + 1

  while (i < content.length) {
    if (content[i] === '\\') {
      i += 2 // skip escaped char
      continue
    }
    if (content[i] === quote) {
      if (quote === '`' || content[i] === quote) {
        return i + 1
      }
    }
    i++
  }

  return i
}

/**
 * Extract a snippet of the function body for classification.
 */
function extractBodySnippet(content, startIndex, maxLen) {
  const snippet = content.slice(startIndex, startIndex + maxLen)
  return snippet
}

export default analyzeFunctions
