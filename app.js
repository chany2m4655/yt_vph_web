// ====== 유틸 ======
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const nf = new Intl.NumberFormat('en-US');

function toast(text) { $('#status').textContent = text; }
function hoursBetween(aIso, b = new Date()) {
  const a = new Date(aIso);
  const ms = Math.max(0, b - a);
  return Math.max(ms / (1000*60*60), 0.01);
}
function extractVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2];
    }
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
  } catch(e) { /* plain id? */ }
  if (/^[A-Za-z0-9_-]{10,}$/.test(url.trim())) return url.trim();
  return null;
}
function extractPlaylistId(input) {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    if (u.searchParams.get('list')) return u.searchParams.get('list');
  } catch(e) { /* plain id? */ }
  if (/^PL|^UU|^LL|^FL/i.test(input.trim())) return input.trim();
  return null;
}
function extractChannelId(input) {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    if (u.pathname.startsWith('/channel/')) return u.pathname.split('/')[2];
  } catch(e) { /* plain id? or @handle */ }
  if (input.trim().startsWith('UC') && input.trim().length >= 20) return input.trim();
  return null;
}
function toCsv(rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ["rank","title","channel","videoId","url","views","ageHours","vph","publishedAt"];
  const csv = [header.join(',')].concat(
    rows.map(r => [r.rank, r.title, r.channelTitle, r.id, r.url, r.viewCount, r.ageHours, r.vph, r.publishedAt]
      .map(esc).join(','))
  ).join('\n');
  return csv;
}

// ====== API ======
const API = {
  key: null,
  base: 'https://www.googleapis.com/youtube/v3',

  async fetchJson(path, params) {
    const query = new URLSearchParams({...params, key: this.key});
    const res = await fetch(`${this.base}/${path}?${query}`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${t}`);
    }
    return res.json();
  },

  async getVideosByIds(ids) {
    const out = [];
    for (let i=0; i<ids.length; i+=50) {
      const chunk = ids.slice(i, i+50);
      const data = await this.fetchJson('videos', {
        part: 'snippet,statistics',
        id: chunk.join(','),
        maxResults: 50
      });
      out.push(...(data.items || []));
    }
    return out;
  },

  async getUploadsPlaylistId(channelId) {
    const data = await this.fetchJson('channels', {
      part: 'contentDetails',
      id: channelId
    });
    const item = data.items?.[0];
    return item?.contentDetails?.relatedPlaylists?.uploads || null;
  },

  async getPlaylistVideoIds(playlistId, limit=50) {
    const ids = [];
    let pageToken = undefined;
    while (ids.length < limit) {
      const data = await this.fetchJson('playlistItems', {
        part: 'contentDetails',
        playlistId,
        maxResults: Math.min(50, limit - ids.length),
        pageToken
      });
      (data.items || []).forEach(it => {
        const vid = it.contentDetails?.videoId;
        if (vid) ids.push(vid);
      });
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  },

  async searchVideoIds(query, limit=25) {
    const ids = [];
    let pageToken = undefined;
    while (ids.length < limit) {
      const data = await this.fetchJson('search', {
        part: 'id',
        type: 'video',
        order: 'date',
        q: query,
        maxResults: Math.min(50, limit - ids.length),
        pageToken
      });
      (data.items || []).forEach(it => {
        const vid = it.id?.videoId;
        if (vid) ids.push(vid);
      });
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }
};

// ====== 렌더링 ======
function renderRows(items) {
  const tbody = $('#resultTable tbody');
  tbody.innerHTML = '';
  items.forEach(r => {
    const tr = document.createElement('tr');

    const hot = r.vph >= 1000;
    const thumb = `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`;

    tr.innerHTML = `
      <td>${r.rank}</td>
      <td class="thumb"><a href="${r.url}" target="_blank" rel="noopener"><img alt="" src="${thumb}"></a></td>
      <td><a href="${r.url}" target="_blank" rel="noopener">${r.title}</a></td>
      <td>${r.channelTitle}</td>
      <td>${new Intl.NumberFormat('en-US').format(r.viewCount)}</td>
      <td>${r.ageHours.toFixed(2)}</td>
      <td>${new Intl.NumberFormat('en-US').format(Math.round(r.vph))} ${hot ? '<span class="badge hot">HOT</span>' : ''}</td>
      <td>${new Date(r.publishedAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

function computeVPH(items) {
  const rows = items.map(it => {
    const id = it.id;
    const sn = it.snippet || {};
    const st = it.statistics || {};
    const viewCount = Number(st.viewCount || 0);
    const publishedAt = sn.publishedAt;
    const ageHours = hoursBetween(publishedAt);
    const vph = viewCount / ageHours;

    return {
      id,
      title: sn.title || '(no title)',
      channelTitle: sn.channelTitle || '',
      publishedAt,
      viewCount,
      ageHours,
      vph,
      url: `https://www.youtube.com/watch?v=${id}`
    };
  }).filter(r => isFinite(r.vph) && r.ageHours > 0.01);

  rows.sort((a,b) => b.vph - a.vph);
  rows.forEach((r,i) => r.rank = i+1);
  return rows;
}

// ====== 이벤트 ======
function setActiveTab(tabId) {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === tabId));
}

function bindUI() {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

  const saved = localStorage.getItem('yt_api_key');
  if (saved) $('#apiKey').value = saved;
  API.key = saved || null;

  $('#saveKeyBtn').onclick = () => {
    const k = $('#apiKey').value.trim();
    if (!k) return toast('API 키를 입력하세요.');
    localStorage.setItem('yt_api_key', k);
    API.key = k;
    toast('API 키 저장됨.');
  };
  $('#clearKeyBtn').onclick = () => {
    localStorage.removeItem('yt_api_key');
    $('#apiKey').value = '';
    API.key = null;
    toast('API 키 삭제됨.');
  };

  $('#fetchFromUrls').onclick = async () => {
    try {
      if (!API.key) return toast('먼저 API 키를 저장하세요.');
      const urls = $('#videoUrls').value.split('\n').map(s => s.trim()).filter(Boolean);
      const ids = urls.map(extractVideoId).filter(Boolean);
      if (ids.length === 0) return toast('유효한 영상 URL/ID가 없습니다.');
      toast(`영상 ${ids.length}개 조회 중...`);
      const videos = await API.getVideosByIds(ids);
      const rows = computeVPH(videos);
      renderRows(rows);
      toast(`완료: ${rows.length}개.`);
      window.__rows = rows;
    } catch (e) { toast(`오류: ${e.message}`); }
  };

  $('#fetchFromChannel').onclick = async () => {
    try {
      if (!API.key) return toast('먼저 API 키를 저장하세요.');
      const inp = $('#channelInput').value.trim();
      const limit = Math.max(1, Math.min(200, Number($('#channelLimit').value || 50)));
      const chId = extractChannelId(inp);
      if (!chId) return toast('채널 ID 또는 /channel/UC… URL을 입력하세요.');
      toast('채널 업로드 재생목록 확인 중...');
      const upl = await API.getUploadsPlaylistId(chId);
      if (!upl) return toast('업로드 재생목록을 찾을 수 없습니다.');
      toast(`영상 ID ${limit}개 수집 중...`);
      const ids = await API.getPlaylistVideoIds(upl, limit);
      const videos = await API.getVideosByIds(ids);
      const rows = computeVPH(videos);
      renderRows(rows);
      toast(`완료: ${rows.length}개.`);
      window.__rows = rows;
    } catch (e) { toast(`오류: ${e.message}`); }
  };

  $('#fetchFromPlaylist').onclick = async () => {
    try {
      if (!API.key) return toast('먼저 API 키를 저장하세요.');
      const inp = $('#playlistInput').value.trim();
      const limit = Math.max(1, Math.min(200, Number($('#playlistLimit').value || 50)));
      const pl = extractPlaylistId(inp);
      if (!pl) return toast('재생목록 ID 또는 URL을 입력하세요.');
      toast(`재생목록에서 영상 ${limit}개 수집 중...`);
      const ids = await API.getPlaylistVideoIds(pl, limit);
      const videos = await API.getVideosByIds(ids);
      const rows = computeVPH(videos);
      renderRows(rows);
      toast(`완료: ${rows.length}개.`);
      window.__rows = rows;
    } catch (e) { toast(`오류: ${e.message}`); }
  };

  $('#fetchFromSearch').onclick = async () => {
    try {
      if (!API.key) return toast('먼저 API 키를 저장하세요.');
      const q = $('#searchQuery').value.trim();
      const limit = Math.max(1, Math.min(50, Number($('#searchLimit').value || 25)));
      if (!q) return toast('검색어를 입력하세요.');
      toast(`검색 "${q}" 영상 ${limit}개 수집 중...`);
      const ids = await API.searchVideoIds(q, limit);
      const videos = await API.getVideosByIds(ids);
      const rows = computeVPH(videos);
      renderRows(rows);
      toast(`완료: ${rows.length}개.`);
      window.__rows = rows;
    } catch (e) { toast(`오류: ${e.message}`); }
  };

  $('#exportCsvBtn').onclick = () => {
    const rows = window.__rows || [];
    if (!rows.length) return toast('내보낼 데이터가 없습니다.');
    const blob = new Blob([toCsv(rows)], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vph_export.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  $$('#resultTable thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const rows = (window.__rows || []).slice();
      const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
      th.dataset.dir = dir;
      rows.sort((a,b) => {
        const av = a[key], bv = b[key];
        if (typeof av === 'string') return dir==='asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return dir==='asc' ? (av-bv) : (bv-av);
      });
      rows.forEach((r,i)=>r.rank=i+1);
      renderRows(rows);
    });
  });
}

document.addEventListener('DOMContentLoaded', bindUI);
