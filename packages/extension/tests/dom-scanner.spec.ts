import { describe, it, expect } from 'vitest'
import { scanAnnotations, scanGroups } from '../src/content/dom-scanner'
import type { ScannedTarget } from '../src/content/dom-scanner'

describe('scanAnnotations', () => {
  it('returns empty array when no annotations exist', () => {
    document.body.innerHTML = '<div>Hello</div>'
    const result = scanAnnotations(document)
    expect(result).toEqual([])
  })

  it('finds elements with data-webcli-action and extracts metadata', () => {
    document.body.innerHTML = `
      <button
        data-webcli-action="click"
        data-webcli-name="submit-btn"
        data-webcli-desc="Submits the form"
      >Submit</button>
    `
    const result = scanAnnotations(document)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'submit-btn',
      description: 'Submits the form',
      actionKind: 'click',
      sensitive: false,
    })
    expect(result[0].targetId).toBe('wcli_0')
    expect(result[0].selector).toBe('[data-webcli-name="submit-btn"]')
  })

  it('uses data-webcli-key for targetId and selector', () => {
    document.body.innerHTML = `
      <input
        data-webcli-action="fill"
        data-webcli-name="email"
        data-webcli-desc="Email input"
        data-webcli-key="email-field"
      />
    `
    const result = scanAnnotations(document)
    expect(result).toHaveLength(1)
    expect(result[0].targetId).toBe('email-field')
    expect(result[0].selector).toBe('[data-webcli-key="email-field"]')
    expect(result[0].actionKind).toBe('fill')
  })

  it('handles data-webcli-sensitive flag', () => {
    document.body.innerHTML = `
      <input
        data-webcli-action="fill"
        data-webcli-name="password"
        data-webcli-desc="Password input"
        data-webcli-sensitive
      />
    `
    const result = scanAnnotations(document)
    expect(result).toHaveLength(1)
    expect(result[0].sensitive).toBe(true)
  })

  it('extracts group info from ancestor', () => {
    document.body.innerHTML = `
      <div data-webcli-group="login-form" data-webcli-group-name="Login Form" data-webcli-group-desc="The login form">
        <button
          data-webcli-action="click"
          data-webcli-name="login-btn"
          data-webcli-desc="Login button"
        >Login</button>
      </div>
    `
    const result = scanAnnotations(document)
    expect(result).toHaveLength(1)
    expect(result[0].groupId).toBe('login-form')
  })

  it('handles multiple annotated elements', () => {
    document.body.innerHTML = `
      <button data-webcli-action="click" data-webcli-name="btn1" data-webcli-desc="First">1</button>
      <button data-webcli-action="click" data-webcli-name="btn2" data-webcli-desc="Second">2</button>
    `
    const result = scanAnnotations(document)
    expect(result).toHaveLength(2)
    expect(result[0].targetId).toBe('wcli_0')
    expect(result[1].targetId).toBe('wcli_1')
  })

  it('defaults missing name and description to empty string', () => {
    document.body.innerHTML = `<button data-webcli-action="click">Go</button>`
    const result = scanAnnotations(document)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('')
    expect(result[0].description).toBe('')
  })
})

describe('scanGroups', () => {
  it('returns empty array when no groups exist', () => {
    document.body.innerHTML = '<div>Hello</div>'
    const result = scanGroups(document)
    expect(result).toEqual([])
  })

  it('extracts group metadata', () => {
    document.body.innerHTML = `
      <div
        data-webcli-group="auth"
        data-webcli-group-name="Authentication"
        data-webcli-group-desc="Auth section"
      >
        <button data-webcli-action="click" data-webcli-name="login" data-webcli-desc="Login">Login</button>
      </div>
    `
    const result = scanGroups(document)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      groupId: 'auth',
      name: 'Authentication',
      description: 'Auth section',
    })
  })

  it('defaults missing group name and description to empty string', () => {
    document.body.innerHTML = `<div data-webcli-group="my-group"><span>Content</span></div>`
    const result = scanGroups(document)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      groupId: 'my-group',
      name: '',
      description: '',
    })
  })
})
