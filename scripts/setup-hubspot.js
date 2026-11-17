// One-time setup: creates the "Accreditation" custom object, seeds three records,
// and associates each record with a contact. Safe to re-run: it reuses what already exists.
// Usage: node scripts/setup-hubspot.js   (reads PRIVATE_APP_ACCESS from .env)
require('dotenv').config();
const axios = require('axios');

const hs = axios.create({
    baseURL: 'https://api.hubapi.com',
    headers: {
        Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS}`,
        'Content-Type': 'application/json'
    }
});

const SCHEMA = {
    name: 'accreditation',
    labels: { singular: 'Accreditation', plural: 'Accreditations' },
    primaryDisplayProperty: 'name',
    requiredProperties: ['name'],
    searchableProperties: ['name', 'issuing_body'],
    secondaryDisplayProperties: ['issuing_body', 'credential_level'],
    associatedObjects: ['CONTACT'],
    properties: [
        { name: 'name', label: 'Name', type: 'string', fieldType: 'text' },
        { name: 'issuing_body', label: 'Issuing Body', type: 'string', fieldType: 'text' },
        {
            name: 'credential_level', label: 'Credential Level', type: 'enumeration', fieldType: 'select',
            options: ['Foundation', 'Associate', 'Professional', 'Expert'].map((l, i) => ({
                label: l, value: l.toLowerCase(), displayOrder: i
            }))
        },
        { name: 'ce_credits', label: 'CE Credits Required', type: 'number', fieldType: 'number' }
    ]
};

const SEED = [
    {
        contact: { email: 'avery.chen@example.com', firstname: 'Avery', lastname: 'Chen' },
        record: { name: 'Certified Revenue Operations Professional', issuing_body: 'RevOps Standards Board', credential_level: 'professional', ce_credits: '30' }
    },
    {
        contact: { email: 'jordan.patel@example.com', firstname: 'Jordan', lastname: 'Patel' },
        record: { name: 'Data Privacy Practitioner', issuing_body: 'Global Privacy Council', credential_level: 'associate', ce_credits: '20' }
    },
    {
        contact: { email: 'sam.rivera@example.com', firstname: 'Sam', lastname: 'Rivera' },
        record: { name: 'CRM Solutions Architect', issuing_body: 'Institute of CRM Architecture', credential_level: 'expert', ce_credits: '45' }
    }
];

async function getOrCreateSchema() {
    const { data } = await hs.get('/crm/v3/schemas');
    const existing = data.results.find(s => s.name === SCHEMA.name);
    if (existing) {
        console.log(`Schema exists: ${existing.objectTypeId}`);
        return existing;
    }
    const { data: created } = await hs.post('/crm/v3/schemas', SCHEMA);
    console.log(`Schema created: ${created.objectTypeId}`);
    return created;
}

async function upsertContact(contact) {
    const { data } = await hs.post('/crm/v3/objects/contacts/batch/upsert', {
        inputs: [{ id: contact.email, idProperty: 'email', properties: contact }]
    });
    return data.results[0].id;
}

async function findRecordByName(objectTypeId, name) {
    const { data } = await hs.post(`/crm/v3/objects/${objectTypeId}/search`, {
        filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: name }] }],
        limit: 1
    });
    return data.results[0];
}

async function main() {
    const schema = await getOrCreateSchema();
    const typeId = schema.objectTypeId;

    for (const { contact, record } of SEED) {
        const contactId = await upsertContact(contact);
        let rec = await findRecordByName(typeId, record.name);
        if (!rec) {
            ({ data: rec } = await hs.post(`/crm/v3/objects/${typeId}`, { properties: record }));
        }
        await hs.put(`/crm/v4/objects/${typeId}/${rec.id}/associations/default/contacts/${contactId}`);
        console.log(`Record ${rec.id} "${record.name}" <-> contact ${contactId} (${contact.email})`);
    }

    const { data: acct } = await hs.get('/account-info/v3/details');
    console.log(`\nList view: https://app.hubspot.com/contacts/${acct.portalId}/objects/${typeId}/views/all/list`);
}

main().catch(err => {
    console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err);
    process.exit(1);
});
