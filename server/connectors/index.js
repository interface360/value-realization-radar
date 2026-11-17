import csv from './csv.js'
import demo from './demo.js'
import hubspot from './hubspot.js'
import rest from './rest.js'
import salesforce from './salesforce.js'
import servicenow from './servicenow.js'

// Connector registry. To add a CRM: create <name>.js with defineConnector()
// and add it here. Everything else (UI form, mapping, sync) is generic.
const CONNECTORS = [salesforce, servicenow, hubspot, rest, csv, demo]

export const connectors = new Map(CONNECTORS.map((c) => [c.id, c]))

export function getConnector(id) {
  const c = connectors.get(id)
  if (!c) throw new Error(`Unknown connector "${id}"`)
  return c
}
