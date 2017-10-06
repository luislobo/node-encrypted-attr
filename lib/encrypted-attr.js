'use strict'

const alg = 'aes-256-gcm'
const crypto = require('crypto')
const get = require('lodash').get
const set = require('lodash').set
const Buffer = require('safe-buffer').Buffer

function EncryptedAttributes (attributes, options) {
  options = options || {}

  let prefix = Buffer.from(`${alg}$`).toString('base64')

  // Default to `id` attribute as the object identifier, but allow override.
  let verifyId = options.verifyId
  if (verifyId && typeof verifyId !== 'string') {
    verifyId = 'id'
  }

  function encryptAttribute (obj, val) {
    // Encrypted attributes are prefixed with "aes-256-gcm$", the base64
    // encoding of which is in `prefix`. Nulls are not encrypted.
    if (val == null || (typeof val === 'string' && val.startsWith(prefix))) {
      return val
    }
    if (typeof val !== 'string') {
      throw new Error('Encrypted attribute must be a string')
    }
    if (verifyId && !obj[verifyId]) {
      throw new Error(`Cannot encrypt without '${verifyId}'`)
    }
    // Recommended 96-bit nonce with AES-GCM.
    let iv = crypto.randomBytes(12)
    let aad = Buffer.from(
      `${alg}$${verifyId ? obj[verifyId].toString() : ''}$${options.keyId}`)
    let key = Buffer.from(options.keys[options.keyId], 'base64')
    let gcm = crypto.createCipheriv(alg, key, iv)
    gcm.setAAD(aad)

    let result = gcm.update(val, 'utf8', 'base64') + gcm.final('base64')

    return aad.toString('base64') + '$' +
           iv.toString('base64') + '$' +
           result + '$' +
           gcm.getAuthTag().toString('base64').slice(0, 22)
  }

  function encryptAll (obj) {
    for (let attr of attributes) {
      let val = get(obj, attr)
      if (val != null) {
        set(obj, attr, encryptAttribute(obj, val))
      }
    }
    return obj
  }

  function decryptAttribute (obj, val) {
    // Encrypted attributes are prefixed with "aes-256-gcm$", the base64
    // encoding of which is in `prefix`. Nulls are not encrypted.
    if (typeof val !== 'string' || !val.startsWith(prefix)) {
      return val
    }
    if (verifyId && !obj[verifyId]) {
      throw new Error(`Cannot decrypt without '${verifyId}'`)
    }
    let parts = val.split('$').map((x) => Buffer.from(x, 'base64'))
    let aad = parts[0]
    let iv = parts[1]
    let payload = parts[2]
    let tag = parts[3]

    parts = aad.toString().split('$')
    let id = parts[1]
    let keyId = parts[2]

    if (verifyId && (id !== obj[verifyId].toString())) {
      throw new Error(`Encrypted attribute has invalid '${verifyId}'`)
    }
    if (!options.keys[keyId]) {
      throw new Error('Encrypted attribute has invalid key id')
    }
    let key = Buffer.from(options.keys[keyId], 'base64')
    let gcm = crypto.createDecipheriv(alg, key, iv)
    gcm.setAAD(aad)
    gcm.setAuthTag(tag)

    return gcm.update(payload, 'binary', 'utf8') + gcm.final('utf8')
  }

  function decryptAll (obj) {
    for (let attr of attributes) {
      let val = get(obj, attr)
      if (val != null) {
        set(obj, attr, decryptAttribute(obj, val))
      }
    }
    return obj
  }

  return {
    attributes,
    options,
    encryptAttribute,
    encryptAll,
    decryptAttribute,
    decryptAll
  }
}

module.exports = EncryptedAttributes
