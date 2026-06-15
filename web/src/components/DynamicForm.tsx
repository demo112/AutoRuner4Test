import { useState } from 'react'

export default function DynamicForm({
  schema,
  values,
  onSubmit,
}: {
  schema: Record<string, any>
  values: Record<string, any>
  onSubmit: (values: Record<string, any>) => void
}) {
  const [form, setForm] = useState(values)

  const properties = schema.properties || {}

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}
      className="space-y-3"
    >
      {Object.entries(properties).map(([key, def]: [string, any]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {def.title || key}
          </label>
          {def.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              className="rounded"
            />
          ) : def.enum ? (
            <select
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">请选择</option>
              {def.enum.map((v: string) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : def.type === 'number' ? (
            <input
              type="number"
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          ) : (
            <input
              type="text"
              value={form[key] || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        className="px-4 py-1.5 bg-black text-white rounded text-sm hover:bg-gray-800"
      >
        保存
      </button>
    </form>
  )
}
