const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const panelInteractiveComponents = (components: unknown): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = []
  const visit = (value: unknown, depth: number): void => {
    if (depth > 5) return
    if (Array.isArray(value)) { value.forEach(child => visit(child, depth)); return }
    const node = object(value)
    if ([2, 3, 5, 6, 7, 8].includes(Number(node.type))) result.push(node)
    if (Array.isArray(node.components)) visit(node.components, depth + 1)
    if (node.accessory) visit(node.accessory, depth + 1)
  }
  visit(components, 0)
  return result
}
/** Only saved actions from this panel may open tickets. Generic/custom IDs never acquire bot authority. */
export const ticketPanelActionsError = (panelId: string, components: unknown, actions: readonly { readonly custom_id: string }[]): string | undefined => {
  const permitted = new Set(actions.map(action => action.custom_id))
  for (const component of panelInteractiveComponents(components)) {
    if (component.type === 2 && [1, 2, 3, 4].includes(Number(component.style)) && component.disabled !== true && permitted.has(String(component.custom_id))) continue
    if (component.type === 3 && typeof component.custom_id === "string" && component.custom_id.startsWith(`ck:ticket:menu:${panelId}:`)
      && (component.min_values ?? 1) === 1 && (component.max_values ?? 1) === 1
      && component.disabled !== true
      && Array.isArray(component.options) && component.options.length > 0 && component.options.every(option => permitted.has(String(object(option).value)))) continue
    return "Assign each button or menu option to a ticket action from this panel"
  }
  return undefined
}
