// Token Radar's dashboard: a ranked board of pre-token protocols, a detail view for each one and the
// comparables its value rests on. It reads window.RADAR (written beside dashboard/ by main.ts) and
// makes no network call: every byte it shows, every comparable it names, is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  var state = {
    q: '',
    category: 'all',
    minBand: 0,
    tab: 'pre-token',
    sort: 'rank',
    dir: 1,
    selected: null
  };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(Math.round(n));
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'no report';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  // A delta carries a glyph as well as a colour, so it reads without colour vision.
  function fmtDelta(n) {
    if (n === null || n === undefined || !isFinite(n)) return '\u2014';
    return (n > 0 ? '\u25b2 ' : n < 0 ? '\u25bc ' : '\u00b7 ') + Math.abs(n).toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unlisted';
    if (days >= 365) return (days / 365).toFixed(1) + 'y no token';
    return Math.max(0, Math.round(days)) + 'd no token';
  }
  // The note under the arithmetic: what the multiple rests on, and what the band is.
  function derivationNote(row, again) {
    var parts = [];
    parts.push('Model ' + DATA.model_version + ' recomputes this row as ' + fmtUsd(again) + (again === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.'));
    parts.push('The multiple is ' + fmtMult(row.multiple) + ' of TVL.');
    if (row.category_n > 0) {
      var where = row.category_n > row.peers.length ? ' (the ' + row.peers.length + ' largest are listed below)' : ' (all of them are listed below)';
      parts.push(Math.round(row.category_weight * 100) + '% of it comes from the ' + row.category_n + ' ' + (row.category || 'uncategorised') + ' comparables in the snapshot' + where + ', and the rest from the size curve.');
    } else {
      parts.push('It comes from the size curve alone: the snapshot holds no live ' + (row.category || 'uncategorised') + ' protocol.');
    }
    parts.push('The band is those comparables\u2019 own spread around the fit, \u00d7' + DATA.band.low.toFixed(2) + ' to \u00d7' + DATA.band.high.toFixed(2) + '.');
    return parts.join(' ');
  }
  function fmtUsdExact(n) {
    if (!isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtMult(m) {
    if (!isFinite(m)) return 'n/a';
    if (m >= 10) return m.toFixed(1) + 'x';
    if (m >= 1) return m.toFixed(2) + 'x';
    return m.toFixed(3) + 'x';
  }

  // The model in one function. The page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so page and data are visibly the same arithmetic.
  function recompute(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var raw = row.tvl_usd * row.multiple * growthMult * maturity;
    var magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))) - 4);
    return Math.max(1, Math.round(raw / magnitude) * magnitude);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, derived the same way main.ts derives it: the protocol's own record decides the
  // action, the capital, the hold and every cost and time. No protocol name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 150;
    if (p.tvl_usd >= 25e6) return 75;
    return 40;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ", keep the vault shares, and read the vault's own page for the points program it runs.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', borrow a small amount against it and repay it, and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ', swap once through the pool, and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', use the bridged funds in an app on the destination chain, and bridge the remainder back.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('liquid') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and hold the receipt token instead of unstaking.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and keep one small delta-neutral position open for the qualifying window.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then claim the outcome when it resolves.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the minted balance.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' through ' + name + ", and hold it after checking what the asset's own transfer rules allow.";
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy open through the qualifying window.';
    if (c.indexOf('governance') >= 0 || c.indexOf('incentive') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ', where its incentives are distributed, and vote on one proposal if holders may.';
    if (c.indexOf('payment') >= 0 || c.indexOf('chain') >= 0) return 'Run $' + capital + ' of activity through ' + name + ' on ' + chain + ', such as a channel, a bridge leg or a fee-paying transfer, and leave the balance in place.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open through the qualifying window.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var action = actionFor(row, capital, chain);
    var ratio = row.implied_value_usd / capital;
    var upside = ratio >= 100 ? Math.round(ratio).toLocaleString('en-US') + 'x' : (Math.round(ratio * 100) / 100) + 'x';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 10 : 5) + ' of gas', time: '15 minutes to set up' },
      { text: "Make one qualifying action each week in " + row.name + "'s own app (a deposit, a borrow, a swap or a vote) so the wallet reads as an active user and not as a one-off deposit.", cost: 'about $3 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and never withdraw the whole balance in a single transaction.', cost: 'the $' + capital + " stays in the position and carries the protocol's own risk while it is there", time: hold + ' days' },
      { text: "Treat the board's claim as " + upside + ' of token value on a $' + capital + ' position: the board puts this protocol at ' + fmtUsd(row.implied_value_usd) + ', or ' + fmtUsd(row.implied_low_usd) + ' to ' + fmtUsd(row.implied_high_usd) + ' across its band, so leave if the TVL halves inside two weeks.', cost: 'no cost to check; unwinding early costs gas and slippage', time: '20 minutes each week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes itself, and write the wallet, the dates and every transaction into a farm log.", cost: 'no fee to check and never pay to claim, and nothing but the log', time: '15 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('band')) state.minBand = Number(params.get('band')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.minBand) params.set('band', String(state.minBand));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.minBand && r.implied_value_usd * 2.2 < state.minBand) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'Token Radar' })
      ),
      el('nav', { class: 'top-meta' },
        el('span', { class: 'chip', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'chip', text: DATA.comparables_size + ' comparables' }),
        el('span', { class: 'chip', text: 'Model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', { class: 'lede-copy' },
        el('h1', { text: DATA.board_size + ' protocols with no token, priced against the ones that trade' }),
        el('p', { class: 'lede-sub', text: 'The board covers all ' + DATA.watchlist_size + ' watchlist protocols, every one the snapshot records with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token of its own, and adds ' + DATA.early_size + ' smaller ones below that floor. A pre-token protocol is priced at the multiple its size and category trade at among the snapshot\'s own ' + DATA.comparables_size + ' live-token protocols, and its implied value is a band, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('span', { class: 'facts-head', text: 'This snapshot, at a glance' }),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { title: 'Pre-token protocols under the $50M floor, ranked anyway', text: 'Under the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Comparables measured' }), el('b', { text: String(DATA.comparables_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top row' }), el('b', { text: fmtUsd(DATA.rows[0].implied_value_usd) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Protocol, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var band = el('select', { id: 'band', 'aria-label': 'Filter by implied value' },
      [0, 5e6, 2e7, 1e8].map(function (v) {
        return el('option', { value: String(v), text: v === 0 ? 'Any implied value' : fmtUsd(v) + ' and up', selected: state.minBand === v ? 'selected' : null });
      })
    );
    band.addEventListener('change', function () { state.minBand = Number(band.value) || 0; writeHash(); render(); });
    var pre = el('button', { type: 'button', class: state.tab === 'pre-token' ? 'tab on' : 'tab', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', class: state.tab === 'live' ? 'tab on' : 'tab', text: 'Comparables (live)', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var method = el('button', { type: 'button', class: state.tab === 'method' ? 'tab on' : 'tab', text: 'How it is priced', onclick: function () { state.tab = 'method'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'band', text: 'Implied value' }), band),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'View' }), el('div', { class: 'tabs' }, pre, live, method)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? 'Showing 1\u2013' + filtered().length + ' of ' + DATA.rows.length + ' ranked rows' : state.tab === 'live' ? DATA.live.length + ' live-token comparables' : 'the model, stated' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', class: state.sort === key ? 'sorted' : '', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search, pick another category, or lower the implied-value filter.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.minBand = 0; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-top': r.rank === 1 ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') + ' \u00b7 ' + fmtAge(r.age_days) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtDelta(r.change_7d) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', { class: 'val' },
          el('div', { class: 'implied' },
            el('div', { class: 'val-line' },
              el('span', { class: 'num strong', text: fmtUsd(r.implied_value_usd) }),
              el('span', { class: 'band', text: fmtUsd(r.implied_low_usd) + '\u2009\u2013\u2009' + fmtUsd(r.implied_high_usd) })
            ),
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
          )
        )
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first; each bar is scaled to the largest value in view, and the grey range is the comparables\' own spread. Select a row for the comparables behind it and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', '#'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtDelta(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num strong', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The comparables: protocols whose token already trades, so their market cap over TVL is a measurement, not a model. The radar reads its multiple off these.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'mcap / TVL' })
          )),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How a value is implied' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot\'s own figures, and its two judgements are printed below. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('div', null, el('span', { text: 'multiple' }), el('b', { text: '10^(a + b \u00b7 log10 TVL), then moved toward its category median' })),
        el('div', null, el('span', { text: 'growth' }), el('b', { text: '1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight })),
        el('div', null, el('span', { text: 'maturity' }), el('b', { text: m.maturity_floor + ' + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range })),
        el('div', null, el('span', { text: 'implied' }), el('b', { text: 'TVL \u00d7 multiple \u00d7 growth \u00d7 maturity, to 5 significant figures' })),
        el('div', null, el('span', { text: 'band' }), el('b', { text: 'the comparables\u2019 own spread: \u00d7' + DATA.band.low.toFixed(2) + ' to \u00d7' + DATA.band.high.toFixed(2) }))
      ),
      el('p', { class: 'sub', text: 'The multiple is the whole argument. ' + DATA.comparables_size + ' protocols in the snapshot carry both a token that trades and a TVL, so the market itself has answered what a protocol is worth per dollar locked: their market cap over TVL runs from a small fraction for a large vault to more than 1 for a young DEX. The radar fits that ratio against TVL in log space, takes each category\u2019s median against the fit, and shrinks a thin category back toward the curve. A protocol is then priced at the multiple its own size and category trade at, not at a number chosen by hand.' }),
      el('p', { class: 'sub', text: 'Two judgements remain, and they are printed above rather than hidden: the seven-day growth is read as a launch window and clipped to ' + m.growth_floor + '% to ' + m.growth_cap + '% (a token is not priced on one week of flows), and the maturity curve rises from ' + m.maturity_floor + ' to ' + (m.maturity_floor + m.maturity_range).toFixed(2) + ' over three years of running with no token, so a protocol that has proven demand without a token is credited for it.' }),
      el('p', { class: 'sub', text: 'The band is the comparables\u2019 own dispersion around the fit, so a row\u2019s high value is a protocol that would look cheap for its category and its low value one that would look rich. Age is the time since DefiLlama first listed the protocol (' + DATA.as_of + ' minus its listing day), the snapshot\u2019s own record of how long it has run with no token.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var again = recompute(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' \u00b7 no token on record' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') + ' \u00b7 listed ' + (row.listed_at || 'unrecorded') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'What the price rests on' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Multiple (size and category)' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(3) + '\u00d7' })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(3) + '\u00d7' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num strong', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Band' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' \u2013 ' + fmtUsd(row.implied_high_usd) }))
      ),
      el('div', { class: 'work' },
        el('span', { text: 'the arithmetic, in full' }),
        el('b', { text: fmtUsdExact(row.tvl_usd) + ' \u00d7 ' + row.multiple.toFixed(3) + ' (multiple) \u00d7 ' + row.growth_multiplier.toFixed(3) + ' (growth) \u00d7 ' + row.maturity_multiplier.toFixed(3) + ' (maturity) = ' + fmtUsdExact(row.tvl_usd * row.multiple * row.growth_multiplier * row.maturity_multiplier) + ', written as ' + fmtUsd(row.implied_value_usd) })
      ),
      el('p', { class: 'sub', text: derivationNote(row, again) })
    ));
    if (row.peers && row.peers.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Priced against' }),
        el('table', { class: 'peers' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Live protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Multiple' })
          )),
          el('tbody', null, row.peers.map(function (p) {
            return el('tr', null,
              el('td', { text: p.name }),
              el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
              el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
              el('td', { class: 'num strong', text: fmtMult(p.ratio) })
            );
          }))
        ),
        el('p', { class: 'sub', text: 'These are snapshot protocols whose token already trades. They are evidence, not a forecast: a token that does not exist yet may never exist, and a live protocol\u2019s multiple is what its own market pays today.' })
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(methodPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Implied value is a model over a sealed snapshot, never advice: no token is promised and none is priced here.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
