# AEGIS design decisions

The implementation follows the attached product brief's muted teal / mint direction, elevated with modern craft:

- **Impeccable:** public design guidance informed the restrained hierarchy, task-specific copy, limited surfaces, and avoidance of AI clichés or generic dashboard layouts. Formatted modular architecture replaces single-file minification. Source: https://impeccable.style/
- **transitions.dev:** applied curated UI motion patterns including springy modal transitions (`cubic-bezier(0.16, 1, 0.3, 1)`), page transition fade/lift, notification badge pop-in, live audio recording visualizer with soundwave oscillation, tactile press feedback, and accordion disclosure animations. Source: https://transitions.dev/
- **GreenSock (official `gsap-skills`):** integrated `@gsap/react` using the recommended `useGSAP()` hook and scoped refs (`scope: containerRef`), animating transforms and opacity (`y`, `autoAlpha`, `scale`) for staggered card and timeline entrances without layout thrashing. Source: https://github.com/greensock/gsap-skills
- **Apple Design:** immediate press feedback, predictable disclosure, readable type hierarchy, and strict reduced-motion support.
- **shadcn:** the component layer uses Radix Slot / CVA composition pattern with custom CSS and Radix Dialog for focus handling.

Fonts are bundled locally (Plus Jakarta Sans). Main tokens are `#397F7C`, `#E5F2EF`, `#F8FAF9`, `#203536`. Secondary body text uses `#586F6D` instead of `#687C7C` to maintain WCAG AA contrast. Responsive navigation collapses cleanly to a horizontally scrollable strip on mobile. Dialogs use Radix focus trapping and restoration. No external analytics, tracking, or telemetry.
