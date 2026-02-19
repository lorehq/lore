// Rewrites instructions.md content for linked work repos.
// Replaces Repo Boundary section and rewrites relative paths to absolute hub paths.

function rewriteForLinkedRepo(content, hubPath) {
  // Rewrite backtick-quoted relative paths to absolute hub paths FIRST,
  // before replacing Repo Boundary (whose replacement text uses backtick paths
  // that should NOT be rewritten).
  const prefixes = [
    'docs/',
    '.lore/',
    '.lore-config',
    'agent-registry.md',
    'skills-registry.md',
    'scripts/',
    'hooks/',
    'MEMORY.local.md',
  ];
  for (const prefix of prefixes) {
    content = content.replaceAll('`' + prefix, '`' + hubPath + '/' + prefix);
  }

  // Replace Repo Boundary section with linked-repo language.
  // Done after path rewriting so the replacement text keeps its local paths intact.
  const boundaryRe = /(## Repo Boundary\n)[\s\S]*?(?=\n## )/;
  const linkedBoundary = `## Repo Boundary

**This is a work repo linked to a Lore hub at \`${hubPath}\`.** Application code belongs here. All knowledge, skills, agents, work tracking, and docs live in the hub — use absolute hub paths below. Do not create \`docs/\`, \`.lore/\`, or knowledge directories in this repo.

`;
  content = content.replace(boundaryRe, linkedBoundary);

  return content;
}

module.exports = { rewriteForLinkedRepo };
