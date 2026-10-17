# AEGIS design decisions

The supplied repository was empty when inspected on October 17, 2026. No starter or existing package/build was available. This implementation follows the attached product brief's muted teal / mint direction.

- **Impeccable:** its public design guidance informed the restrained hierarchy, task-specific copy, limited surfaces, and avoidance of gradients or KPI-heavy Home layouts. Source: https://impeccable.style/
- **Apple Design:** reviewed the requested skill's full guidance and applied immediate press feedback, predictable disclosure, readable type hierarchy, and reduced-motion support. Source: https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md
- **shadcn:** the component layer uses its Radix Slot / CVA composition pattern with custom CSS and Radix Dialog for focus handling. This is not a claim that the shadcn MCP server was invoked. Source: https://ui.shadcn.com/docs/mcp
- **Chrome DevTools MCP:** project-local VS Code MCP configuration is provided alongside shadcn. The server was not connected to this Codex session; actual browser verification used Codex's browser tool. Source: https://github.com/ChromeDevTools/chrome-devtools-mcp

Fonts are bundled locally. Main tokens are #397F7C, #E5F2EF, #F8FAF9, #203536. Secondary body text uses #586F6D instead of the brief's #687C7C to improve contrast. Responsive navigation collapses to a horizontally scrollable strip. Dialogs use Radix focus trapping and restoration. No analytics, autoplay, or external font calls.

The CSS paper motif is decorative and hidden from assistive technology. Exact color contrast and keyboard checks are recorded in QA.md; this is not a claim of a complete WCAG conformance audit.
