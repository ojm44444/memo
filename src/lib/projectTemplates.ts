export type ProjectTemplateId = 'blank' | 'songwriter' | 'album'

export type ProjectTemplate = {
  id: ProjectTemplateId
  label: string
  description: string
  sections: string[]
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Inbox only — add sections as you go',
    sections: [],
  },
  {
    id: 'songwriter',
    label: 'Songwriter',
    description: 'Ideas → Drafts → Finals',
    sections: ['Ideas', 'Drafts', 'Finals'],
  },
  {
    id: 'album',
    label: 'Album',
    description: 'Writing → Demos → Mixing → Masters',
    sections: ['Writing', 'Demos', 'Mixing', 'Masters'],
  },
]

export function getProjectTemplate(id: ProjectTemplateId) {
  return PROJECT_TEMPLATES.find((template) => template.id === id) ?? PROJECT_TEMPLATES[0]
}
