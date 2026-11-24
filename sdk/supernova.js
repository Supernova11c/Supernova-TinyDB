(() => {
  class SupernovaDB {
    constructor({ projectId, publicKey, url = 'https://api.supernovadb.com' }) {
      if (!projectId || !publicKey) throw new Error('projectId and publicKey are required');
      this.projectId = projectId;
      this.publicKey = publicKey;
      this.url = url.replace(/\/$/, '');
    }
    collection(name) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) throw new Error('Invalid collection name');
      const base = `${this.url}/v1/data/${encodeURIComponent(name)}`;
      const request = async (method, endpoint = '', data) => {
        const response = await fetch(`${base}${endpoint}`, {
          method,
          headers: {
            'X-Project-ID': this.projectId,
            'X-Public-Key': this.publicKey,
            ...(data === undefined ? {} : { 'Content-Type': 'application/json' })
          },
          ...(data === undefined ? {} : { body: JSON.stringify(data) })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          const error = new Error(result.error?.message || `Request failed (${response.status})`);
          error.code = result.error?.code || 'INTERNAL_SERVER_ERROR';
          error.status = response.status;
          throw error;
        }
        return result.data;
      };
      return {
        get: (options = {}) => {
          const params = new URLSearchParams();
          if (options.limit != null) params.set('limit', options.limit);
          if (options.offset != null) params.set('offset', options.offset);
          return request('GET', params.size ? `?${params}` : '');
        },
        find: async (id) => (await request('GET')).find(record => record.id === id) || null,
        insert: data => request('POST', '', data),
        update: (id, data) => request('PUT', `/${encodeURIComponent(id)}`, data),
        delete: id => request('DELETE', `/${encodeURIComponent(id)}`)
      };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = SupernovaDB;
  if (typeof window !== 'undefined') window.SupernovaDB = SupernovaDB;
})();
