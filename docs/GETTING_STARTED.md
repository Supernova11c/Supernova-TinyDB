# Using Supernova DB from a static site

## Create a project

Run the service, register with an email and a password of at least 12 characters, then verify using the local development link printed in the server logs. Sign in, create a project, and make a collection such as `notes`. Store the generated public key securely; it is shown once when created or rotated.

## Direct fetch

```js
const response = await fetch('https://your-api.example/v1/data/notes', {
  headers: {
    'X-Project-ID': 'YOUR_PROJECT_ID',
    'X-Public-Key': 'YOUR_PUBLIC_KEY'
  }
});
const result = await response.json();
if (!result.success) throw new Error(result.error.message);
console.log(result.data);
```

The default public API is read-only. In the authenticated dashboard, change a collection permission to allow public inserts only when needed. Public users can then insert values to that collection, so validate data/rate limits in your own application and never store sensitive or trusted data based on browser input.

## Browser SDK

After `npm run sdk:build`, include `<script src="https://your-api.example/assets/supernova.js"></script>` and use:

```js
const db = new SupernovaDB({ projectId: 'YOUR_PROJECT_ID', publicKey: 'YOUR_PUBLIC_KEY', url: 'https://your-api.example' });
const notes = db.collection('notes');
const all = await notes.get({ limit: 25 });
await notes.insert({ title: 'Hello' }); // requires collection insert permission
```

`collection()` returns `get`, `find(id)`, `insert`, `update(id, object)`, and `delete(id)`. The default project public credential is safe to expose but provides no assurance that a visitor is a trusted user. Never include administrative credentials in static-site code.
