/*
 * 鐘點核對單 — 試用版的假後台
 * 在瀏覽器裡模擬試算表與寄信，不連任何伺服器、不會真的寄信。
 * 資料只存在這個分頁，重新整理就還原。
 */
(function () {
  'use strict';

  var ME = 'demo@apodevelop.com';
  var NAMES = ['王大明', '李小華', '張志豪', '陳美玲', '林家豪', '黃怡君', '吳建宏', '劉雅婷', '蔡宗翰',
    '楊淑芬', '許文彬', '鄭佳蓉', '謝明哲', '洪雅雯', '郭俊傑', '曾雅琪', '周冠宇', '蘇怡安'];
  var UNREGISTERED = '陳美玲';         // 示範：沒登錄信箱，寄到代收信箱
  var BROKEN = '吳建宏';               // 示範：信箱寫錯，會寄送失敗
  var BROKEN_EMAIL = 'wrong-address@example.com';

  var COLOR = { main: '#1f5f8b', mainDark: '#17486a', headBg: '#e8f0f7', subBg: '#f4f8fb',
    line: '#c9d6e2', text: '#22303c', muted: '#8a97a3', pageBg: '#f3f6f9' };

  function emailOf(i) { return 'teacher' + String(i + 1).padStart(2, '0') + '@example.com'; }

  var S = {
    quota: 1500,
    admins: [ME],
    config: {
      title: '115年9月份兼代課暨輔導課鐘點核對單',
      period: '9/1 ~ 9/26（共4週）',
      sendDate: '2026年10月2日',
      senderName: '○○國中教務處教學組',
      replyTo: '',
      fallbackEmail: 'office@example.edu.tw',
      queryUrl: '',
      notes: [
        '由於各項經費來源不同，故兼課鐘點費並不會在同一時間全部一起入帳，若對時數有疑問，請於發出後三天內至教務處確認。',
        '◎第八節輔導課停課時間：9/25 教師節前一日補假'
      ]
    },
    items: [
      { header: '2.兼課鐘點', label: '兼課時數', unit: '節', group: '' },
      { header: '5.代導師折抵', label: '代導師\n課務折抵', unit: '天', group: '' },
      { header: '3.兼課代課鐘點', label: '兼課\n(代其他老師)', unit: '節', group: '代課時數' },
      { header: '1.代課鐘點', label: '一般代課', unit: '節', group: '代課時數' },
      { header: '4.輔導課鐘點', label: '輔導課時數', unit: '節', group: '' }
    ],
    teachers: [],   // 教師信箱：{name, email}
    records: [],    // 當月總計：{name, hours:{header:n}}
    mailLog: [],    // [時間, 結算期間, 姓名, 寄送信箱, 是否登錄, 結果, 操作者]
    queryLog: [],   // [時間, 姓名, 結果]
    actionLog: []   // [時間, 操作者, 動作, 內容]
  };

  NAMES.forEach(function (n, i) {
    if (n !== UNREGISTERED) S.teachers.push({ name: n, email: n === BROKEN ? BROKEN_EMAIL : emailOf(i) });
    var h = {};
    h['1.代課鐘點'] = i % 4 ? i % 3 : 2;
    h['2.兼課鐘點'] = 4 + (i * 3) % 9;
    h['3.兼課代課鐘點'] = i % 5 === 1 ? 2 : 0;
    h['4.輔導課鐘點'] = i % 3 === 0 ? 6 : 0;
    h['5.代導師折抵'] = i === 2 ? 1 : 0;
    S.records.push({ name: n, hours: h });
  });

  // ───────── 小工具 ─────────
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { var d = new Date(); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function short() { var d = new Date(); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function normName(v) { return trim(v).replace(/[\s　]/g, ''); }
  function normEmail(v) { return trim(v).replace(/[\s　]/g, '').toLowerCase(); }
  function isEmail(v) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v || ''); }
  function esc(v) { return trim(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cleanHeader(v) { return trim(v).replace(/^﻿/, '').replace(/[\s　]/g, ''); }
  function findHeader(headers, list) {
    var h = headers.map(function (x) { return cleanHeader(x).toLowerCase(); });
    for (var i = 0; i < list.length; i++) { var k = h.indexOf(list[i].toLowerCase()); if (k !== -1) return k; }
    return -1;
  }
  function teacherEmail(name) {
    for (var i = 0; i < S.teachers.length; i++) if (S.teachers[i].name === name) return S.teachers[i].email;
    return '';
  }
  function hasHours(r) { return S.items.some(function (it) { return r.hours[it.header]; }); }
  function view(r) {
    var email = teacherEmail(r.name);
    return { name: r.name, hours: r.hours, email: email, registered: !!email,
      sendTo: email || S.config.fallbackEmail };
  }
  function find(name) {
    name = normName(name);
    for (var i = 0; i < S.records.length; i++) if (S.records[i].name === name) return view(S.records[i]);
    throw new Error('找不到這位老師：' + name);
  }
  function status() {
    var map = {};
    S.mailLog.forEach(function (row) { if (row[1] === S.config.period) map[row[2]] = { result: row[5], time: row[7] }; });
    return map;
  }
  function act(action, detail) { S.actionLog.push([now(), ME, action, detail]); }

  // ───────── 核對單 HTML（跟正式版同樣的版面） ─────────
  function table(hours) {
    var c = COLOR, items = S.items, last = items.length - 1, line = '1px solid ' + c.line;
    var thMain = 'background:' + c.headBg + ';color:' + c.mainDark + ';font-weight:700;font-size:14px;padding:10px 4px;line-height:1.35;border-bottom:' + line + ';';
    var thSub = 'background:' + c.subBg + ';color:' + c.mainDark + ';font-weight:600;font-size:12px;padding:6px 4px;line-height:1.35;border-bottom:' + line + ';';
    var right = function (i) { return i === last ? '' : 'border-right:' + line + ';'; };
    var label = function (t) { return esc(t).replace(/\n/g, '<br>'); };
    var hasGroup = items.some(function (it) { return it.group; });
    var r1 = '', r2 = '';
    for (var i = 0; i < items.length; i++) {
      var g = items[i].group;
      if (!g) { r1 += '<th' + (hasGroup ? ' rowspan="2"' : '') + ' style="' + thMain + right(i) + '">' + label(items[i].label) + '</th>'; continue; }
      var span = 0;
      while (i + span < items.length && items[i + span].group === g) { r2 += '<th style="' + thSub + right(i + span) + '">' + label(items[i + span].label) + '</th>'; span++; }
      r1 += '<th colspan="' + span + '" style="' + thMain + right(i + span - 1) + '">' + label(g) + '</th>';
      i += span - 1;
    }
    var r3 = items.map(function (it, i) {
      var v = hours[it.header] || 0;
      var num = v ? '<span style="font-size:22px;font-weight:700;color:' + c.text + ';">' + v + '</span>'
                  : '<span style="font-size:20px;color:' + c.muted + ';">0</span>';
      return '<td style="padding:14px 4px;white-space:nowrap;' + right(i) + '">' + num +
        '<span style="font-size:12px;color:' + c.muted + ';margin-left:2px;">' + esc(it.unit) + '</span></td>';
    }).join('');
    return '<div style="border:' + line + ';border-radius:10px;overflow:hidden;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" ' +
      'style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;text-align:center;font-family:\'Noto Sans TC\',\'PingFang TC\',\'Microsoft JhengHei\',sans-serif;">' +
      '<tr>' + r1 + '</tr>' + (r2 ? '<tr>' + r2 + '</tr>' : '') + '<tr>' + r3 + '</tr></table></div>';
  }

  function mailHtml(r) {
    var c = COLOR, cfg = S.config;
    var notes = cfg.notes.length ? '<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:' + c.text + ';">' +
      cfg.notes.map(function (n) { return '<li style="margin-bottom:6px;">' + esc(n) + '</li>'; }).join('') + '</ul>' : '';
    return '<div style="margin:0;padding:24px 12px;background:' + c.pageBg + ';font-family:\'Noto Sans TC\',\'PingFang TC\',\'Microsoft JhengHei\',sans-serif;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid ' + c.line + ';border-radius:12px;">' +
      '<tr><td style="background:' + c.main + ';color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;">' +
      '<div style="font-size:19px;font-weight:700;">' + esc(cfg.title) + '</div>' +
      (cfg.period ? '<div style="font-size:14px;opacity:.9;margin-top:2px;">結算期間：' + esc(cfg.period) + '</div>' : '') + '</td></tr>' +
      '<tr><td style="padding:20px 24px 8px;font-size:16px;color:' + c.text + ';"><b>' + esc(r.name) + '</b> 老師您好，本期鐘點時數如下：</td></tr>' +
      '<tr><td style="padding:8px 24px 20px;">' + table(r.hours) + '</td></tr>' +
      (notes ? '<tr><td style="padding:0 24px 16px;">' + notes + '</td></tr>' : '') +
      '<tr><td align="center" style="padding:4px 24px 20px;"><a href="teacher.html" target="_top" style="display:inline-block;padding:11px 28px;background:' + c.main +
      ';color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">線上查詢核對單</a>' +
      '<div style="font-size:12px;color:' + c.muted + ';margin-top:8px;">以姓名＋本信收件信箱登入</div></td></tr>' +
      '<tr><td style="padding:12px 24px 18px;border-top:1px solid ' + c.line + ';font-size:12px;color:' + c.muted + ';">' +
      (cfg.sendDate ? esc(cfg.sendDate) + ' 寄發　' : '') + '此信由系統自動寄出，時數有疑問請洽' + esc(cfg.senderName || '教學組') + '。</td></tr></table></div>';
  }
  function subject(r) { return (r.registered ? '' : '【未登錄信箱・請轉交】') + S.config.title + '－' + r.name + ' 老師'; }

  function send(r) {
    if (S.quota < 1) return '失敗：今日寄信額度已用完';
    if (r.sendTo === BROKEN_EMAIL) return '失敗：信箱不存在（' + r.sendTo + '）';
    S.quota--;
    return '成功';
  }
  function logMail(r, result) {
    S.mailLog.push([now(), S.config.period, r.name, r.sendTo, r.registered ? '是' : '否（代收）', result, ME, short()]);
  }

  // ───────── 匯入 ─────────
  function parseImport(rows) {
    if (!rows || rows.length < 2) throw new Error('沒有資料：第一列要是標題，第二列開始是資料');
    var headers = rows[0].map(cleanHeader);
    var nameCol = findHeader(headers, ['姓名', '教師']);
    if (nameCol === -1) throw new Error('第一列找不到「姓名」欄位');
    var emailCol = findHeader(headers, ['電子信箱', 'email', 'e-mail', '信箱']);
    var itemCol = headers.indexOf('項目'), hoursCol = findHeader(headers, ['時數', '節數']);
    function itemOf(t) {
      t = cleanHeader(t);
      for (var k = 0; k < S.items.length; k++) if (cleanHeader(S.items[k].header) === t || cleanHeader(S.items[k].label) === t) return S.items[k];
      return null;
    }
    var by = {}, order = [], unknown = {}, bad = [], ignored = [], format;
    function t(name) {
      if (!by[name]) { by[name] = { name: name, hours: {}, email: '' }; S.items.forEach(function (it) { by[name].hours[it.header] = 0; }); order.push(name); }
      return by[name];
    }
    if (itemCol !== -1 && hoursCol !== -1) {
      format = '一筆一列（項目／姓名／時數）';
      for (var i = 1; i < rows.length; i++) {
        var name = normName(rows[i][nameCol]), lab = trim(rows[i][itemCol]), raw = trim(rows[i][hoursCol]);
        if (raw === '') continue;
        if (!name) { bad.push('第 ' + (i + 1) + ' 列有時數但沒有姓名'); continue; }
        var it = itemOf(lab);
        if (!it) { unknown[lab || '（空白）'] = (unknown[lab || '（空白）'] || 0) + 1; continue; }
        if (isNaN(Number(raw))) { bad.push('第 ' + (i + 1) + ' 列時數不是數字：' + raw); continue; }
        t(name).hours[it.header] += Number(raw);
      }
    } else {
      format = '一人一列';
      var cols = S.items.map(function () { return -1; });
      headers.forEach(function (h, c) {
        if (c === nameCol || c === emailCol || !h) return;
        var it = itemOf(h);
        if (it) cols[S.items.indexOf(it)] = c; else ignored.push(h);
      });
      if (cols.every(function (c) { return c === -1; })) {
        throw new Error('第一列找不到任何核對項目。項目欄名要是：' + S.items.map(function (it) { return it.header; }).join('、'));
      }
      for (var j = 1; j < rows.length; j++) {
        var n = normName(rows[j][nameCol]);
        if (!n) continue;
        var tt = t(n);
        cols.forEach(function (c, k) {
          if (c === -1) return;
          var v = trim(rows[j][c]);
          if (v === '') return;
          if (isNaN(Number(v))) { bad.push('第 ' + (j + 1) + ' 列「' + S.items[k].header + '」不是數字：' + v); return; }
          tt.hours[S.items[k].header] += Number(v);
        });
        if (emailCol !== -1 && isEmail(normEmail(rows[j][emailCol]))) tt.email = normEmail(rows[j][emailCol]);
      }
    }
    var list = order.map(function (n) { var x = by[n]; if (!x.email) x.email = teacherEmail(n); return x; })
      .filter(function (x) { return S.items.some(function (it) { return x.hours[it.header]; }); });
    return { format: format, teachers: list, unknown: unknown, bad: bad, ignored: ignored };
  }

  // ───────── 對外的 API（名稱跟正式版一樣） ─────────
  var API = {
    adminInit: function () {
      var st = status();
      return {
        me: ME, admins: S.admins.slice(), config: JSON.parse(JSON.stringify(S.config)), autoUrl: 'teacher.html',
        items: JSON.parse(JSON.stringify(S.items)), quota: S.quota, mailAuthError: '', hasTotal: true,
        records: S.records.map(function (raw) {
          var r = view(raw), s = st[r.name];
          return { name: r.name, values: S.items.map(function (it) { return r.hours[it.header] || 0; }), hasHours: hasHours(r),
            email: r.email, sendTo: r.sendTo, registered: r.registered, status: s ? s.result : '', statusTime: s ? s.time : '' };
        })
      };
    },
    saveConfig: function (d) {
      ['replyTo', 'fallbackEmail'].forEach(function (k) {
        var v = normEmail(d[k]);
        if (v && !isEmail(v)) throw new Error('信箱格式不正確：' + v);
        d[k] = v;
      });
      ['title', 'period', 'sendDate', 'senderName', 'replyTo', 'fallbackEmail', 'queryUrl'].forEach(function (k) { S.config[k] = trim(d[k]); });
      S.config.notes = (d.notes || []).map(trim).filter(Boolean);
      act('修改設定', '結算期間：' + S.config.period);
      return S.config;
    },
    saveItems: function (list) {
      var seen = {};
      S.items = list.map(function (it) {
        var h = trim(it.header);
        if (!h) throw new Error('每個項目都要填「欄位標題」');
        if (seen[h]) throw new Error('欄位標題重複：' + h);
        seen[h] = true;
        return { header: h, label: trim(it.label) || h, unit: trim(it.unit), group: trim(it.group) };
      });
      act('修改核對項目', S.items.map(function (it) { return it.header; }).join('、'));
      return true;
    },
    saveAdmins: function (list) {
      var out = [];
      list.forEach(function (v) { v = normEmail(v); if (!v) return; if (!isEmail(v)) throw new Error('信箱格式不正確：' + v); if (out.indexOf(v) === -1) out.push(v); });
      if (out.indexOf(ME) === -1) throw new Error('不能把自己（' + ME + '）移除');
      S.admins = out;
      act('修改管理員', out.join('、'));
      return out;
    },
    previewMail: function (name) {
      var r = find(name);
      return { to: r.sendTo, subject: subject(r), html: mailHtml(r), registered: r.registered };
    },
    sendTestToMe: function (name) { find(name); return ME; },
    sendToTeacher: function (name) {
      if (!S.config.period) throw new Error('請先到「設定」填寫結算期間');
      var r = find(name);
      if (!r.sendTo) throw new Error(r.name + ' 老師沒有信箱，請先設定信箱或代收信箱');
      var res = send(r);
      logMail(r, res);
      return res;
    },
    sendBatchChunk: function () {
      if (!S.config.period) throw new Error('請先到「設定」填寫結算期間');
      var st = status();
      var todo = S.records.map(view).filter(function (r) { return hasHours(r) && r.sendTo && !st[r.name]; });
      var ok = 0, fail = 0, failed = [], stop = '';
      for (var i = 0; i < todo.length && i < 4; i++) {   // 每次寄 4 封，讓進度條看得到
        if (S.quota < 1) { stop = '今日寄信額度已用完'; break; }
        var res = send(todo[i]);
        logMail(todo[i], res);
        if (res === '成功') ok++; else { fail++; failed.push({ name: todo[i].name, result: res }); }
      }
      var left = todo.length - ok - fail;
      return { ok: ok, fail: fail, failed: failed, left: left, stopReason: stop || (left ? '時間到' : ''), quota: S.quota };
    },
    setTeacherEmail: function (name, email) {
      name = normName(name); email = normEmail(email);
      if (!name) throw new Error('請輸入姓名');
      if (!isEmail(email)) throw new Error('信箱格式不正確');
      var t = S.teachers.filter(function (x) { return x.name === name; })[0];
      if (t) t.email = email; else S.teachers.push({ name: name, email: email });
      act('設定老師信箱', name + '：' + email);
      return true;
    },
    getTeachers: function () { return { teachers: S.teachers.slice(), legacyCount: 0, hasLegacy: false }; },
    importTeachers: function (rows) {
      if (!rows || rows.length < 2) throw new Error('沒有資料：第一列要是標題（姓名、電子信箱）');
      var h = rows[0].map(cleanHeader), nc = findHeader(h, ['姓名', '教師']), ec = findHeader(h, ['電子信箱', 'email', 'e-mail', '信箱']);
      if (nc === -1 || ec === -1) throw new Error('第一列要有「姓名」和「電子信箱」兩個欄位');
      var added = 0, updated = 0, bad = [];
      for (var i = 1; i < rows.length; i++) {
        var n = normName(rows[i][nc]), e = normEmail(rows[i][ec]);
        if (!n && !e) continue;
        if (!n || !isEmail(e)) { bad.push('第 ' + (i + 1) + ' 列：' + (n || '（無姓名）') + ' ' + e); continue; }
        var t = S.teachers.filter(function (x) { return x.name === n; })[0];
        if (t) { t.email = e; updated++; } else { S.teachers.push({ name: n, email: e }); added++; }
      }
      act('匯入教師信箱', '新增 ' + added + '、更新 ' + updated);
      return { added: added, updated: updated, bad: bad };
    },
    deleteTeacher: function (name) {
      S.teachers = S.teachers.filter(function (x) { return x.name !== name; });
      act('刪除教師信箱', name);
      return true;
    },
    // 示範用的「彙整」工作表：每月分批貼上的鐘點，一筆一列
    listSourceSheets: function () { return ['彙整']; },
    readSheetRows: function (name) {
      if (name !== '彙整') throw new Error('找不到工作表「' + name + '」');
      var rows = [['項目', '姓名', '時數']];
      NAMES.forEach(function (n, i) {
        rows.push(['2.兼課鐘點', n, 4 + (i * 2) % 7]);
        if (i % 2) rows.push(['1.代課鐘點', n, 1 + i % 3]);
        if (i % 3 === 0) rows.push(['1.代課鐘點', n, 2]);
        if (i % 4 === 1) rows.push(['4.輔導課鐘點', n, 6]);
        rows.push(['8.教師名冊', n, '']);
      });
      rows.push(['1.代課鐘點', '', '']);
      return rows;
    },
    previewImport: function (rows) {
      var p = parseImport(rows);
      return {
        format: p.format, count: p.teachers.length,
        totals: S.items.map(function (it) { return p.teachers.reduce(function (s, x) { return s + (x.hours[it.header] || 0); }, 0); }),
        noEmail: p.teachers.filter(function (x) { return !x.email; }).map(function (x) { return x.name; }),
        unknownItems: Object.keys(p.unknown).map(function (k) { return k + '（' + p.unknown[k] + ' 筆）'; }),
        ignoredCols: p.ignored, badRows: p.bad.slice(0, 50), badCount: p.bad.length,
        sample: p.teachers.slice(0, 8).map(function (x) { return { name: x.name, email: x.email, values: S.items.map(function (it) { return x.hours[it.header] || 0; }) }; })
      };
    },
    importData: function (rows) {
      var p = parseImport(rows);
      if (!p.teachers.length) throw new Error('沒有可匯入的老師資料');
      p.teachers.forEach(function (x) { if (x.email && !teacherEmail(x.name)) S.teachers.push({ name: x.name, email: x.email }); });
      S.records = p.teachers.map(function (x) { return { name: x.name, hours: x.hours }; });
      var backup = '當月總計_備份_' + now().replace(/\D/g, '');
      act('匯入當月總計', p.teachers.length + ' 位，舊資料備份到「' + backup + '」');
      return { count: p.teachers.length, backup: backup };
    },
    getLogs: function () {
      return {
        mail: S.mailLog.slice().reverse().map(function (r) { return r.slice(0, 7); }),
        query: S.queryLog.slice().reverse(),
        action: S.actionLog.slice().reverse()
      };
    },
    getPageInfo: function () { return { title: S.config.title, period: S.config.period, contact: S.config.senderName }; },
    queryHours: function (name, email) {
      name = normName(name); email = normEmail(email);
      if (!name || !email) return { ok: false, msg: '請輸入姓名與電子信箱。' };
      var r = null;
      try { r = find(name); } catch (e) { r = null; }
      if (!r || !r.registered || r.email !== email) {
        S.queryLog.push([now(), name, '失敗']);
        return { ok: false, msg: '查無資料：姓名或電子信箱不符，或本月沒有時數紀錄。請輸入收到核對單通知的那個信箱。（試用帳號：王大明／teacher01@example.com）' };
      }
      S.queryLog.push([now(), name, '成功']);
      return { ok: true, name: name, title: S.config.title, period: S.config.period, sendDate: S.config.sendDate,
        notes: S.config.notes.slice(), tableHtml: table(r.hours) };
    },
    mailHtml: function (name) { return mailHtml(find(name)); }
  };

  // 模擬 google.script.run：非同步呼叫、成功／失敗回呼
  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, fn) {
        if (fn === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (fn === 'withFailureHandler') return function (f) { return runner(ok, f); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          setTimeout(function () {
            var res;
            try { res = JSON.parse(JSON.stringify(API[fn].apply(null, args))); }
            catch (e) { if (fail) fail(e); return; }
            if (ok) ok(res);
          }, 150 + Math.random() * 150);
        };
      }
    });
  }
  window.google = { script: { run: runner() } };
  window.DEMO = API;
})();
