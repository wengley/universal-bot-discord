// db/supabaseDb.js
// Substituto do quick.db (que usava um arquivo SQLite local, apagado a cada
// deploy/reinício no Render). Guarda tudo numa tabela do Supabase (grátis),
// então os dados sobrevivem a redeploys e reinícios.
//
// Implementa a mesma "API" que o resto do bot já usa: get(), set(), add(),
// sub(), delete() — incluindo notação por ponto tipo "guild_123.welcome"
// (igual o quick.db fazia), pra não precisar reescrever os comandos.

const { createClient } = require('@supabase/supabase-js');

class SupabaseDB {
  constructor(url, serviceKey) {
    if (!url || !serviceKey) {
      throw new Error(
        'SupabaseDB: defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env'
      );
    }
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    this.table = 'bot_kv';
  }

  _splitPath(path) {
    const idx = path.indexOf('.');
    if (idx === -1) return { key: path, subPath: null };
    return { key: path.slice(0, idx), subPath: path.slice(idx + 1) };
  }

  async _getRaw(key) {
    const { data, error } = await this.client
      .from(this.table)
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : undefined;
  }

  async _setRaw(key, value) {
    const { error } = await this.client
      .from(this.table)
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  _getNested(obj, subPath) {
    if (obj === undefined || obj === null) return undefined;
    return subPath
      .split('.')
      .reduce((acc, p) => (acc === undefined || acc === null ? undefined : acc[p]), obj);
  }

  _setNested(obj, subPath, value) {
    const parts = subPath.split('.');
    const root = obj && typeof obj === 'object' ? { ...obj } : {};
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      cur[p] = cur[p] && typeof cur[p] === 'object' ? { ...cur[p] } : {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    return root;
  }

  // Igual quick.db: retorna null se não existir
  async get(path) {
    const { key, subPath } = this._splitPath(path);
    const raw = await this._getRaw(key);
    if (subPath === null) return raw === undefined ? null : raw;
    const val = this._getNested(raw, subPath);
    return val === undefined ? null : val;
  }

  async set(path, value) {
    const { key, subPath } = this._splitPath(path);
    if (subPath === null) {
      await this._setRaw(key, value);
      return value;
    }
    const raw = await this._getRaw(key);
    const updated = this._setNested(raw, subPath, value);
    await this._setRaw(key, updated);
    return value;
  }

  async add(path, amount) {
    const current = (await this.get(path)) || 0;
    const updated = current + amount;
    await this.set(path, updated);
    return updated;
  }

  async sub(path, amount) {
    return this.add(path, -amount);
  }

  async delete(path) {
    const { key, subPath } = this._splitPath(path);
    if (subPath === null) {
      const { error } = await this.client.from(this.table).delete().eq('key', key);
      if (error) throw error;
      return true;
    }
    const raw = await this._getRaw(key);
    if (raw && typeof raw === 'object') {
      const parts = subPath.split('.');
      const root = { ...raw };
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]]) return true;
        cur[parts[i]] = { ...cur[parts[i]] };
        cur = cur[parts[i]];
      }
      delete cur[parts[parts.length - 1]];
      await this._setRaw(key, root);
    }
    return true;
  }
}

module.exports = { SupabaseDB };
