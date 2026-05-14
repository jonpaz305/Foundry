// ════════════════════════════════════════════════════════════════
// FOUNDRY M2 - Media Section (Property Photos + Neighborhood Map)
// ════════════════════════════════════════════════════════════════
// Manages all property media for the active deal: photos (up to 8,
// type-tagged) and a single neighborhood map. Photos are stored in
// the foundry_deal_photos table (one row per photo). Map is stored
// in the foundry_deals.neighborhood_map_base64 column.
//
// Both photo and map upload paths use the same client-side resize
// pipeline (resizeImageToBase64) to keep base64 row sizes manageable.
// Phone photos at 3-5MB get reduced to ~400KB before upload.
//
// CONTRACT
//   renderMediaBlock()                  -> renders the section UI
//   loadPhotosForCurrentDeal()          -> fetches photos from Supabase
//   handlePhotoUpload(input)            -> upload handler (file input)
//   handleMapUpload(input)              -> map upload handler
//   removePhoto(id)                     -> delete a photo by id
//   removeMap()                         -> clear the deal's map
//   updatePhotoType(id, type)           -> change a photo's type tag
//   updatePhotoCaption(id, caption)     -> change a photo's caption
//   movePhoto(id, direction)            -> reorder up/down
//
// READS
//   currentDeal                         -> active deal record
//   sb                                  -> Supabase client (from core.js)
//   currentUser                         -> auth user (from core.js)
//
// WRITES
//   currentDeal.neighborhood_map_base64
//   DEAL_PHOTOS                         -> array of photo records
// ════════════════════════════════════════════════════════════════

// Global photo cache for the active deal. Populated by
// loadPhotosForCurrentDeal() called from core.js's loadDeal().
var DEAL_PHOTOS = [];

// Photo type tags. Order is the dropdown order. Display labels are
// keyed by the same identifiers used in the Supabase check constraint.
var PHOTO_TYPES = [
  { id: 'exterior',    label: 'Exterior' },
  { id: 'interior',    label: 'Interior' },
  { id: 'kitchen',     label: 'Kitchen' },
  { id: 'bathroom',    label: 'Bathroom' },
  { id: 'living_room', label: 'Living Room' },
  { id: 'bedroom',     label: 'Bedroom' },
  { id: 'common_area', label: 'Common Area' },
  { id: 'other',       label: 'Other' }
];

function _photoTypeLabel(id) {
  for (var i = 0; i < PHOTO_TYPES.length; i++) {
    if (PHOTO_TYPES[i].id === id) return PHOTO_TYPES[i].label;
  }
  return 'Other';
}

// ─── Client-side resize ──────────────────────────────────────
// Reads a File, downsizes via canvas to max width 1600px, encodes
// at JPEG quality 0.85, returns a base64 data URI. Phone photos at
// 3-5MB come out around 300-500KB. Keeps base64 row sizes within
// Supabase's per-row limits while preserving print-quality detail.
function resizeImageToBase64(file, maxWidth, quality) {
  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('No file provided')); return; }
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error('FileReader failed')); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { reject(new Error('Image decode failed')); };
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        var mw = maxWidth || 1600;
        if (w > mw) {
          h = Math.round(h * (mw / w));
          w = mw;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var q = (typeof quality === 'number') ? quality : 0.85;
        var dataUri = canvas.toDataURL('image/jpeg', q);
        resolve(dataUri);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Supabase: load photos for active deal ───────────────────
async function loadPhotosForCurrentDeal() {
  DEAL_PHOTOS = [];
  if (!currentDeal || !currentDeal.id) return;
  try {
    const { data, error } = await sb
      .from('foundry_deal_photos')
      .select('*')
      .eq('deal_id', currentDeal.id)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    DEAL_PHOTOS = data || [];
  } catch (e) {
    console.error('[Foundry M2] load photos:', e);
    DEAL_PHOTOS = [];
  }
}

// ─── Render the Media section ────────────────────────────────
function renderMediaBlock() {
  var wrap = $('section-media-body');
  if (!wrap) return;
  if (!currentDeal) {
    wrap.innerHTML = '<div class="panel"><div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No deal selected</div></div></div>';
    return;
  }

  var photosUsed = DEAL_PHOTOS.length;
  var photosRemaining = Math.max(0, 8 - photosUsed);
  var hasMap = !!(currentDeal.neighborhood_map_base64);

  var photoRowsHtml = DEAL_PHOTOS.length === 0
    ? '<div class="empty" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">No photos uploaded yet. Tap "Upload photo" above to add property photos (up to 8).</div>'
    : DEAL_PHOTOS.map(function (p, idx) {
        var typeOpts = PHOTO_TYPES.map(function (t) {
          return '<option value="' + t.id + '"' + (p.photo_type === t.id ? ' selected' : '') + '>' + t.label + '</option>';
        }).join('');
        var capVal = p.caption || '';
        return '' +
          '<div class="media-photo-row" style="display:grid;grid-template-columns:120px 1fr auto;gap:12px;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;align-items:center">' +
            '<img src="' + p.image_base64 + '" alt="Photo ' + (idx + 1) + '" style="width:120px;height:80px;object-fit:cover;border-radius:4px;background:#222"/>' +
            '<div style="display:flex;flex-direction:column;gap:6px">' +
              '<div style="display:flex;gap:8px;align-items:center">' +
                '<select onchange="updatePhotoType(\'' + p.id + '\', this.value)" style="flex:0 0 auto;min-width:120px">' + typeOpts + '</select>' +
                '<span style="font-size:11px;color:var(--text3)">Position ' + (idx + 1) + ' of ' + DEAL_PHOTOS.length + '</span>' +
              '</div>' +
              '<input type="text" value="' + escapeHtml(capVal) + '" placeholder="Optional caption (e.g. Unit 4 kitchen post-reno reference)" oninput="updatePhotoCaption(\'' + p.id + '\', this.value)" style="font-size:12px;width:100%"/>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:4px">' +
              '<button class="btn btn-sm btn-ghost" onclick="movePhoto(\'' + p.id + '\', -1)" ' + (idx === 0 ? 'disabled' : '') + ' title="Move up">▲</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="movePhoto(\'' + p.id + '\', 1)" ' + (idx === DEAL_PHOTOS.length - 1 ? 'disabled' : '') + ' title="Move down">▼</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="removePhoto(\'' + p.id + '\')" style="color:var(--bad)" title="Delete">✕</button>' +
            '</div>' +
          '</div>';
      }).join('');

  var mapHtml = hasMap
    ? '<div style="display:grid;grid-template-columns:1fr auto;gap:12px;padding:10px;border:1px solid var(--border);border-radius:6px;align-items:center">' +
        '<img src="' + currentDeal.neighborhood_map_base64 + '" alt="Neighborhood map" style="max-width:100%;max-height:240px;width:auto;height:auto;border-radius:4px;background:#222"/>' +
        '<button class="btn btn-sm btn-ghost" onclick="removeMap()" style="color:var(--bad)">Remove</button>' +
      '</div>'
    : '<div class="empty" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">No map uploaded. Tap "Upload map" above to add a neighborhood map (Zillow screenshot, Google Maps, custom annotated map, etc).</div>';

  wrap.innerHTML = '' +
    '<div class="panel">' +
      '<div class="panel-title">Property Media' +
        '<span class="panel-sub">Photos and neighborhood map for the BRRRR Package equity-partner report.</span>' +
      '</div>' +

      '<div class="ssub" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">' +
        '<span>Property Photos ' + photosUsed + ' / 8</span>' +
        '<div>' +
          '<input type="file" id="media-photo-input" accept="image/*" style="display:none" onchange="handlePhotoUpload(this)"/>' +
          '<button class="btn btn-sm btn-gold" onclick="document.getElementById(\'media-photo-input\').click()" ' + (photosRemaining === 0 ? 'disabled title="8 photo maximum reached"' : '') + '>+ Upload photo</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px">' + photoRowsHtml + '</div>' +

      '<div class="ssub" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center">' +
        '<span>Neighborhood Map ' + (hasMap ? '(uploaded)' : '(none)') + '</span>' +
        '<div>' +
          '<input type="file" id="media-map-input" accept="image/*" style="display:none" onchange="handleMapUpload(this)"/>' +
          '<button class="btn btn-sm btn-gold" onclick="document.getElementById(\'media-map-input\').click()">' + (hasMap ? 'Replace map' : '+ Upload map') + '</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px">' + mapHtml + '</div>' +

      '<div style="margin-top:18px;padding:10px;background:var(--gold-bg);border:1px solid var(--gold-bd);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.5">' +
        '<strong style="color:var(--gold-lt)">Tip:</strong> Photos and the map appear in the BRRRR Package report only (used for sending to potential equity partners). Other report types (Lender Package, Internal Memo, F&amp;F Package) are unaffected. Photos are resized client-side to ~400KB max for storage; the originals on your device are not uploaded.' +
      '</div>' +

    '</div>';
}

// ─── Photo upload ─────────────────────────────────────────────
async function handlePhotoUpload(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (!currentDeal || !currentDeal.id) {
    alert('Open a deal first.');
    input.value = '';
    return;
  }
  if (DEAL_PHOTOS.length >= 8) {
    alert('Maximum of 8 photos per deal. Delete one before uploading another.');
    input.value = '';
    return;
  }
  if (!file.type || file.type.indexOf('image/') !== 0) {
    alert('Please select an image file (JPG, PNG, etc).');
    input.value = '';
    return;
  }
  // Resize first, then upload to Supabase
  try {
    flashSaveIndicator('Resizing photo...');
    var b64 = await resizeImageToBase64(file, 1600, 0.85);
    // Determine next sort_order
    var nextSort = DEAL_PHOTOS.length === 0
      ? 0
      : Math.max.apply(null, DEAL_PHOTOS.map(function (p) { return p.sort_order || 0; })) + 1;
    flashSaveIndicator('Uploading photo...');
    const { data, error } = await sb
      .from('foundry_deal_photos')
      .insert({
        user_id: currentUser.id,
        deal_id: currentDeal.id,
        photo_type: 'exterior',
        caption: null,
        image_base64: b64,
        sort_order: nextSort
      })
      .select().single();
    if (error) throw error;
    DEAL_PHOTOS.push(data);
    flashSaveIndicator('Photo saved');
    renderMediaBlock();
  } catch (e) {
    console.error('[Foundry M2] photo upload:', e);
    alert('Could not upload photo: ' + (e.message || 'unknown error'));
  }
  input.value = '';
}

// ─── Map upload ──────────────────────────────────────────────
async function handleMapUpload(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (!currentDeal || !currentDeal.id) {
    alert('Open a deal first.');
    input.value = '';
    return;
  }
  if (!file.type || file.type.indexOf('image/') !== 0) {
    alert('Please select an image file (JPG, PNG, etc).');
    input.value = '';
    return;
  }
  try {
    flashSaveIndicator('Resizing map...');
    // Maps generally need less width than photos; 1400px is plenty
    var b64 = await resizeImageToBase64(file, 1400, 0.85);
    flashSaveIndicator('Uploading map...');
    const { data, error } = await sb
      .from('foundry_deals')
      .update({ neighborhood_map_base64: b64, updated_at: new Date().toISOString() })
      .eq('id', currentDeal.id)
      .select().single();
    if (error) throw error;
    currentDeal.neighborhood_map_base64 = b64;
    flashSaveIndicator('Map saved');
    renderMediaBlock();
  } catch (e) {
    console.error('[Foundry M2] map upload:', e);
    alert('Could not upload map: ' + (e.message || 'unknown error'));
  }
  input.value = '';
}

// ─── Delete photo ────────────────────────────────────────────
async function removePhoto(id) {
  if (!confirm('Delete this photo? This cannot be undone.')) return;
  try {
    const { error } = await sb.from('foundry_deal_photos').delete().eq('id', id);
    if (error) throw error;
    DEAL_PHOTOS = DEAL_PHOTOS.filter(function (p) { return p.id !== id; });
    flashSaveIndicator('Photo deleted');
    renderMediaBlock();
  } catch (e) {
    console.error('[Foundry M2] delete photo:', e);
    alert('Could not delete photo: ' + (e.message || 'unknown error'));
  }
}

// ─── Clear map ───────────────────────────────────────────────
async function removeMap() {
  if (!confirm('Remove the neighborhood map? This cannot be undone.')) return;
  try {
    const { error } = await sb
      .from('foundry_deals')
      .update({ neighborhood_map_base64: null, updated_at: new Date().toISOString() })
      .eq('id', currentDeal.id);
    if (error) throw error;
    currentDeal.neighborhood_map_base64 = null;
    flashSaveIndicator('Map removed');
    renderMediaBlock();
  } catch (e) {
    console.error('[Foundry M2] remove map:', e);
    alert('Could not remove map: ' + (e.message || 'unknown error'));
  }
}

// ─── Update photo type ───────────────────────────────────────
async function updatePhotoType(id, newType) {
  var p = DEAL_PHOTOS.find(function (x) { return x.id === id; });
  if (!p) return;
  p.photo_type = newType;
  try {
    const { error } = await sb
      .from('foundry_deal_photos')
      .update({ photo_type: newType, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    flashSaveIndicator('Type updated');
  } catch (e) {
    console.error('[Foundry M2] update photo type:', e);
  }
}

// ─── Update photo caption (debounced via simple per-photo timer)
var _captionTimers = {};
function updatePhotoCaption(id, newCaption) {
  var p = DEAL_PHOTOS.find(function (x) { return x.id === id; });
  if (!p) return;
  p.caption = newCaption;
  if (_captionTimers[id]) clearTimeout(_captionTimers[id]);
  _captionTimers[id] = setTimeout(async function () {
    try {
      const { error } = await sb
        .from('foundry_deal_photos')
        .update({ caption: newCaption || null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      flashSaveIndicator('Caption saved');
    } catch (e) {
      console.error('[Foundry M2] update caption:', e);
    }
  }, 700);
}

// ─── Reorder photos ──────────────────────────────────────────
async function movePhoto(id, direction) {
  var idx = -1;
  for (var i = 0; i < DEAL_PHOTOS.length; i++) {
    if (DEAL_PHOTOS[i].id === id) { idx = i; break; }
  }
  if (idx < 0) return;
  var newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= DEAL_PHOTOS.length) return;
  // Swap in local array
  var tmp = DEAL_PHOTOS[idx];
  DEAL_PHOTOS[idx] = DEAL_PHOTOS[newIdx];
  DEAL_PHOTOS[newIdx] = tmp;
  // Renumber sort_order across the full set
  for (var k = 0; k < DEAL_PHOTOS.length; k++) {
    DEAL_PHOTOS[k].sort_order = k;
  }
  renderMediaBlock();
  // Persist new sort_order values
  try {
    for (var m = 0; m < DEAL_PHOTOS.length; m++) {
      const { error } = await sb
        .from('foundry_deal_photos')
        .update({ sort_order: m, updated_at: new Date().toISOString() })
        .eq('id', DEAL_PHOTOS[m].id);
      if (error) throw error;
    }
    flashSaveIndicator('Order saved');
  } catch (e) {
    console.error('[Foundry M2] reorder:', e);
  }
}
