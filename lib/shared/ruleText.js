/* lib/shared/ruleText.js — A5's READER: an OggDude data folder (or a zip of one) → the open copy's blank rule text
 * (window.SWRPGRuleText; require-able). Ruling argo-dataset-import-draft §3 P-1..P-7 (CONTRACT, D-588), the census
 * rules R-A5C-1..7 (ADDENDUMs 2-3), the build card ADDENDUM 4 §A4.1 item 1, and ADDENDUM 5 (the block below, Q1 (a)).
 *
 * Dependency-free, and it makes NO network call (G1): it is handed the picked files' bytes and the records the panel's
 * loader already holds, parses the XML in the page, and returns two things:
 *   fills   { '<kind>|<record id>|<field path>': text }   — the address the display accessor reads (sources.js ruleText)
 *   report  { name, files, total, filled, stale, kinds: [{kind, filled, of, reasons: [[reason, n]…]}], outside, dropped }
 * It never writes a record (P-4, R-A3C-7's rule): spanHolds, packValidate, charResolve and the editor read the record
 * as before. The join is BY KEY ONLY (P-2): a blank's record key (`_source_key`, `ogg_key`, `ogg_keys`, a vehicle's
 * `key`, a quality's id and aliases, a species option's carried `_source_key`, R-A5C-4) equals a dataset entry's
 * <Key>, with the 27 old → 2.3.4.0 pairs read from oggImport.js's one list (R-A5C-5). The dataset side is indexed by
 * oggImport.js's own `indexBy`, so there is no second index. DataCustom/ wins over Data/ (OggDude's own order).
 *
 * The rules are the census's (brief argo-a5-import-mockup-numbers Appendix A, ruled in by ADDENDUM 3 as the written
 * census, with R-A5C-7d's change); `judge` below follows it line for line, so its report is §A3.3's.
 */
(function (root) {
  'use strict';

  var PH = 'placeholder in your dataset', NID = 'not in your dataset', NFMT = 'not a format Holocron reads yet',
    CANT = "Holocron can't place it yet", FILL = 'filled';
  var REASONS = [PH, NID, NFMT, CANT];

  // ADDENDUM 5 §A5.1: the blanks, by kind, with the workshop's own empties that are not blanks, and the rows no
  // OggDude folder reaches. Read only under bookTextRemoved(); on holocron.work the reader never runs.
  // BEGIN GENERATED RULE_TEXT_BLANKS (scripts/argo_export/gen_rule_text_blanks.py; do not edit by hand)
  var RULE_TEXT_BLANKS = {
    "version": 1,
    "kinds": [
      {
        "kind": "Talents",
        "files": [
          "canonical/talents.json"
        ],
        "patterns": [
          "talents.*.description"
        ],
        "count": 638
      },
      {
        "kind": "Gear",
        "files": [
          "canonical/gear.json"
        ],
        "patterns": [
          "gear.*.base_mods.[].description",
          "gear.*.description",
          "gear.*.pool_mods.[].condition"
        ],
        "count": 807
      },
      {
        "kind": "Weapons",
        "files": [
          "canonical/weapons.json"
        ],
        "patterns": [
          "weapons.*._cite",
          "weapons.*.description",
          "weapons.*.pool_mods.[].condition"
        ],
        "count": 442
      },
      {
        "kind": "Armor",
        "files": [
          "canonical/armor.json"
        ],
        "patterns": [
          "armor.*.base_mods.[].description",
          "armor.*.description",
          "armor.*.pool_mods.[].condition"
        ],
        "count": 165
      },
      {
        "kind": "Attachments",
        "files": [
          "canonical/attachments.json"
        ],
        "patterns": [
          "attachments.*.added_mods.[].description",
          "attachments.*.base_mods.[].description",
          "attachments.*.description",
          "attachments.*.pool_mods.[].condition"
        ],
        "count": 369
      },
      {
        "kind": "Ship attachments",
        "files": [
          "canonical/vehicle-attachments.json"
        ],
        "patterns": [
          "vehicle_attachments.*.added_mods.[].description",
          "vehicle_attachments.*.base_mods.[].description",
          "vehicle_attachments.*.description",
          "vehicle_attachments.*.hp_note"
        ],
        "count": 180
      },
      {
        "kind": "Vehicles",
        "files": [
          "vehicle-library/airspeeders.json",
          "vehicle-library/capital_ships.json",
          "vehicle-library/freighters.json",
          "vehicle-library/landspeeders.json",
          "vehicle-library/patrol_gunships.json",
          "vehicle-library/starfighters.json",
          "vehicle-library/support.json",
          "vehicle-library/transports.json",
          "vehicle-library/walkers_tanks.json"
        ],
        "patterns": [
          "entries.[].base_mods.[].description",
          "entries.[].built_in_attachments.[].description",
          "entries.[].crew",
          "entries.[].description",
          "entries.[].starfighter_complement"
        ],
        "count": 520
      },
      {
        "kind": "Force powers",
        "files": [
          "canonical/force_powers.json"
        ],
        "patterns": [
          "force_powers.*.abilities.alterbasic.description",
          "force_powers.*.abilities.altercontrol1.description",
          "force_powers.*.abilities.altercontrol2.description",
          "force_powers.*.abilities.altercontrol3.description",
          "force_powers.*.abilities.altercontrol4.description",
          "force_powers.*.abilities.altercontrol5.description",
          "force_powers.*.abilities.altercontrol6.description",
          "force_powers.*.abilities.altercontrol7.description",
          "force_powers.*.abilities.alterduration.description",
          "force_powers.*.abilities.altermastery.description",
          "force_powers.*.abilities.alterrange.description",
          "force_powers.*.abilities.alterstrength.description",
          "force_powers.*.abilities.batmedbasic.description",
          "force_powers.*.abilities.batmedcontrol1.description",
          "force_powers.*.abilities.batmedcontrol2.description",
          "force_powers.*.abilities.batmedduration.description",
          "force_powers.*.abilities.batmedmagnitude.description",
          "force_powers.*.abilities.batmedmastery.description",
          "force_powers.*.abilities.batmedrange.description",
          "force_powers.*.abilities.batmedstrength.description",
          "force_powers.*.abilities.bindbasic.description",
          "force_powers.*.abilities.bindcontrol1.description",
          "force_powers.*.abilities.bindcontrol2.description",
          "force_powers.*.abilities.bindduration.description",
          "force_powers.*.abilities.bindmagnitude.description",
          "force_powers.*.abilities.bindmastery.description",
          "force_powers.*.abilities.bindrange.description",
          "force_powers.*.abilities.bindstrength.description",
          "force_powers.*.abilities.conjurebasic.description",
          "force_powers.*.abilities.conjurecontrol1.description",
          "force_powers.*.abilities.conjurecontrol2.description",
          "force_powers.*.abilities.conjureduration.description",
          "force_powers.*.abilities.conjuremagnitude.description",
          "force_powers.*.abilities.conjuremastery.description",
          "force_powers.*.abilities.conjurenumber.description",
          "force_powers.*.abilities.conjurerange.description",
          "force_powers.*.abilities.ebbflowbasic.description",
          "force_powers.*.abilities.ebbflowcontrol1.description",
          "force_powers.*.abilities.ebbflowcontrol2.description",
          "force_powers.*.abilities.ebbflowcontrol3.description",
          "force_powers.*.abilities.ebbflowcontrol4.description",
          "force_powers.*.abilities.ebbflowcontrol5.description",
          "force_powers.*.abilities.ebbflowmagnitude.description",
          "force_powers.*.abilities.ebbflowrange.description",
          "force_powers.*.abilities.ebbflowstrength.description",
          "force_powers.*.abilities.ebbflowstrength2.description",
          "force_powers.*.abilities.ebbflowstrength3.description",
          "force_powers.*.abilities.endurebasic.description",
          "force_powers.*.abilities.endurecontrol.description",
          "force_powers.*.abilities.endureduration.description",
          "force_powers.*.abilities.enduremagnitude.description",
          "force_powers.*.abilities.enduremastery.description",
          "force_powers.*.abilities.endurerange.description",
          "force_powers.*.abilities.endurestrength1.description",
          "force_powers.*.abilities.endurestrength2.description",
          "force_powers.*.abilities.enhancebasic.description",
          "force_powers.*.abilities.enhancecont0.description",
          "force_powers.*.abilities.enhancecont1.description",
          "force_powers.*.abilities.enhancecont2.description",
          "force_powers.*.abilities.enhancecont3.description",
          "force_powers.*.abilities.enhancecont4.description",
          "force_powers.*.abilities.enhancecont5.description",
          "force_powers.*.abilities.enhancecont6.description",
          "force_powers.*.abilities.enhancecont7.description",
          "force_powers.*.abilities.enhancecont8.description",
          "force_powers.*.abilities.enhancecont9.description",
          "force_powers.*.abilities.enhancerange.description",
          "force_powers.*.abilities.farsightbasic.description",
          "force_powers.*.abilities.farsightcontrol1.description",
          "force_powers.*.abilities.farsightcontrol2.description",
          "force_powers.*.abilities.farsightcontrol3.description",
          "force_powers.*.abilities.farsightcontrol4.description",
          "force_powers.*.abilities.farsightcontrol5.description",
          "force_powers.*.abilities.farsightcontrol6.description",
          "force_powers.*.abilities.farsightduration.description",
          "force_powers.*.abilities.farsightmastery.description",
          "force_powers.*.abilities.farsightrange.description",
          "force_powers.*.abilities.forseebasic.description",
          "force_powers.*.abilities.forseecontrol1.description",
          "force_powers.*.abilities.forseecontrol2.description",
          "force_powers.*.abilities.forseecontrol3.description",
          "force_powers.*.abilities.forseeduration.description",
          "force_powers.*.abilities.forseemagnitude.description",
          "force_powers.*.abilities.forseerange.description",
          "force_powers.*.abilities.forseestrength.description",
          "force_powers.*.abilities.healharmbasic.description",
          "force_powers.*.abilities.healharmcontrol1.description",
          "force_powers.*.abilities.healharmcontrol2.description",
          "force_powers.*.abilities.healharmcontrol3.description",
          "force_powers.*.abilities.healharmcontrol4.description",
          "force_powers.*.abilities.healharmmagnitude.description",
          "force_powers.*.abilities.healharmmastery.description",
          "force_powers.*.abilities.healharmrange.description",
          "force_powers.*.abilities.healharmstrength.description",
          "force_powers.*.abilities.imbuebasic.description",
          "force_powers.*.abilities.imbuecontrol1.description",
          "force_powers.*.abilities.imbueduration.description",
          "force_powers.*.abilities.imbueduration2.description",
          "force_powers.*.abilities.imbuemastery.description",
          "force_powers.*.abilities.imbuerange.description",
          "force_powers.*.abilities.imbuestrength.description",
          "force_powers.*.abilities.influencebasic.description",
          "force_powers.*.abilities.influencecontrol1.description",
          "force_powers.*.abilities.influencecontrol2.description",
          "force_powers.*.abilities.influenceduration.description",
          "force_powers.*.abilities.influencemagnitude.description",
          "force_powers.*.abilities.influencerange.description",
          "force_powers.*.abilities.influencestrength.description",
          "force_powers.*.abilities.jerinfbasic.description",
          "force_powers.*.abilities.jerinfcontrol1.description",
          "force_powers.*.abilities.jerinfcontrol2.description",
          "force_powers.*.abilities.jerinfcontrol3.description",
          "force_powers.*.abilities.jerinfmagnitude.description",
          "force_powers.*.abilities.jerinfmastery1.description",
          "force_powers.*.abilities.jerinfmastery2.description",
          "force_powers.*.abilities.jerinfrange.description",
          "force_powers.*.abilities.jerinfstrength.description",
          "force_powers.*.abilities.manipulatebasic.description",
          "force_powers.*.abilities.manipulatecontrol1.description",
          "force_powers.*.abilities.manipulatecontrol2.description",
          "force_powers.*.abilities.manipulatecontrol3.description",
          "force_powers.*.abilities.manipulatecontrol4.description",
          "force_powers.*.abilities.manipulatecontrol5.description",
          "force_powers.*.abilities.manipulatecontrol6.description",
          "force_powers.*.abilities.manipulatecontrol7.description",
          "force_powers.*.abilities.manipulatemastery.description",
          "force_powers.*.abilities.manipulaterange.description",
          "force_powers.*.abilities.manipulatestrength.description",
          "force_powers.*.abilities.misdirbasic.description",
          "force_powers.*.abilities.misdircontrol1.description",
          "force_powers.*.abilities.misdircontrol2.description",
          "force_powers.*.abilities.misdircontrol3.description",
          "force_powers.*.abilities.misdirduration.description",
          "force_powers.*.abilities.misdirmagnitude.description",
          "force_powers.*.abilities.misdirmastery.description",
          "force_powers.*.abilities.misdirrange.description",
          "force_powers.*.abilities.misdirstrength.description",
          "force_powers.*.abilities.movebasic.description",
          "force_powers.*.abilities.movecontrol1.description",
          "force_powers.*.abilities.movecontrol2.description",
          "force_powers.*.abilities.movecontrol3.description",
          "force_powers.*.abilities.movemagnitude.description",
          "force_powers.*.abilities.moverange.description",
          "force_powers.*.abilities.movestrength.description",
          "force_powers.*.abilities.protunlbasicpower.description",
          "force_powers.*.abilities.protunlcontrol1.description",
          "force_powers.*.abilities.protunlcontrol2.description",
          "force_powers.*.abilities.protunlcontrol3.description",
          "force_powers.*.abilities.protunlduration.description",
          "force_powers.*.abilities.protunlmagnitude.description",
          "force_powers.*.abilities.protunlmastery.description",
          "force_powers.*.abilities.protunlrange.description",
          "force_powers.*.abilities.protunlstrength.description",
          "force_powers.*.abilities.seekbasicpower.description",
          "force_powers.*.abilities.seekcontrol1.description",
          "force_powers.*.abilities.seekcontrol2.description",
          "force_powers.*.abilities.seekcontrol3.description",
          "force_powers.*.abilities.seekduration.description",
          "force_powers.*.abilities.seekmagnitude.description",
          "force_powers.*.abilities.seekmastery.description",
          "force_powers.*.abilities.seekstrength.description",
          "force_powers.*.abilities.sensebasic.description",
          "force_powers.*.abilities.sensecontrol1.description",
          "force_powers.*.abilities.sensecontrol2.description",
          "force_powers.*.abilities.sensecontrol3.description",
          "force_powers.*.abilities.senseduration.description",
          "force_powers.*.abilities.sensemagnitude.description",
          "force_powers.*.abilities.senserange.description",
          "force_powers.*.abilities.sensestrength.description",
          "force_powers.*.abilities.suppressbasic.description",
          "force_powers.*.abilities.suppresscontrol1.description",
          "force_powers.*.abilities.suppresscontrol2.description",
          "force_powers.*.abilities.suppresscontrol3.description",
          "force_powers.*.abilities.suppressduration.description",
          "force_powers.*.abilities.suppressmastery.description",
          "force_powers.*.abilities.suppressrange.description",
          "force_powers.*.abilities.suppressstrength.description",
          "force_powers.*.abilities.warforbasic.description",
          "force_powers.*.abilities.warforcontrol1.description",
          "force_powers.*.abilities.warforcontrol2.description",
          "force_powers.*.abilities.warforcontrol3.description",
          "force_powers.*.abilities.warforcontrol4.description",
          "force_powers.*.abilities.warforduration.description",
          "force_powers.*.abilities.warformagnitude.description",
          "force_powers.*.abilities.warforrange.description",
          "force_powers.*.abilities.warforstrength.description"
        ],
        "count": 186
      },
      {
        "kind": "Signature abilities",
        "files": [
          "canonical/signature_abilities.json"
        ],
        "patterns": [
          "signature_abilities.*.abilities.activationds.description",
          "signature_abilities.*.abilities.addboostne.description",
          "signature_abilities.*.abilities.alwaysgetmymarkbasic.description",
          "signature_abilities.*.abilities.alwaysgetmymarkchangeskill1.description",
          "signature_abilities.*.abilities.alwaysgetmymarkchangeskill2.description",
          "signature_abilities.*.abilities.alwaysgetmymarkdestiny.description",
          "signature_abilities.*.abilities.alwaysgetmymarkincreaseeffect1.description",
          "signature_abilities.*.abilities.alwaysgetmymarkincreaseeffect2.description",
          "signature_abilities.*.abilities.alwaysgetmymarkincreaserange.description",
          "signature_abilities.*.abilities.alwaysgetmymarkreducedifficulty.description",
          "signature_abilities.*.abilities.alwaysgetmymarktakedown.description",
          "signature_abilities.*.abilities.biggertheyarebasic.description",
          "signature_abilities.*.abilities.biggertheyaredestiny.description",
          "signature_abilities.*.abilities.biggertheyaredifficulty.description",
          "signature_abilities.*.abilities.biggertheyareduration.description",
          "signature_abilities.*.abilities.biggertheyaresalvo.description",
          "signature_abilities.*.abilities.biggertheyaresilhouette.description",
          "signature_abilities.*.abilities.biggertheyareskill1.description",
          "signature_abilities.*.abilities.biggertheyareskill2.description",
          "signature_abilities.*.abilities.boostalliesds.description",
          "signature_abilities.*.abilities.changescalene.description",
          "signature_abilities.*.abilities.changeskill1ds.description",
          "signature_abilities.*.abilities.changeskill2ds.description",
          "signature_abilities.*.abilities.changeskillne.description",
          "signature_abilities.*.abilities.counterespbase.description",
          "signature_abilities.*.abilities.counterespboost.description",
          "signature_abilities.*.abilities.counterespdestiny.description",
          "signature_abilities.*.abilities.counterespreducesetback.description",
          "signature_abilities.*.abilities.counterespskill1.description",
          "signature_abilities.*.abilities.counterespskill2.description",
          "signature_abilities.*.abilities.counterespturnagent.description",
          "signature_abilities.*.abilities.deadlyrepaddsetback.description",
          "signature_abilities.*.abilities.deadlyrepassociation.description",
          "signature_abilities.*.abilities.deadlyrepbase.description",
          "signature_abilities.*.abilities.deadlyrepdestiny.description",
          "signature_abilities.*.abilities.deadlyrepduration.description",
          "signature_abilities.*.abilities.deadlyrepincreaseeffect.description",
          "signature_abilities.*.abilities.destinyds.description",
          "signature_abilities.*.abilities.destinyne.description",
          "signature_abilities.*.abilities.destinyuf.description",
          "signature_abilities.*.abilities.destinyui.description",
          "signature_abilities.*.abilities.diplomaticsolutionbase.description",
          "signature_abilities.*.abilities.discernmotivesui.description",
          "signature_abilities.*.abilities.fatduelbalance.description",
          "signature_abilities.*.abilities.fatduelbasic.description",
          "signature_abilities.*.abilities.fatduelduration.description",
          "signature_abilities.*.abilities.fatduelinspire.description",
          "signature_abilities.*.abilities.fatduelreducediff.description",
          "signature_abilities.*.abilities.fatduelstandfirm.description",
          "signature_abilities.*.abilities.frequency.description",
          "signature_abilities.*.abilities.frequencyuf.description",
          "signature_abilities.*.abilities.frequencyui.description",
          "signature_abilities.*.abilities.hardertheyfalincnumberl.description",
          "signature_abilities.*.abilities.hardertheyfallbase.description",
          "signature_abilities.*.abilities.hardertheyfallchangeskill.description",
          "signature_abilities.*.abilities.hardertheyfalldestiny.description",
          "signature_abilities.*.abilities.hardertheyfallfreq.description",
          "signature_abilities.*.abilities.hardertheyfallignoredef.description",
          "signature_abilities.*.abilities.hardertheyfallreducediff.description",
          "signature_abilities.*.abilities.increaseeffectuf.description",
          "signature_abilities.*.abilities.increaseeffne.description",
          "signature_abilities.*.abilities.increasenumberuf.description",
          "signature_abilities.*.abilities.increasenumberui.description",
          "signature_abilities.*.abilities.increaserangeuf.description",
          "signature_abilities.*.abilities.insightfuladdboost.description",
          "signature_abilities.*.abilities.insightfuladdskill.description",
          "signature_abilities.*.abilities.insightfulbasic.description",
          "signature_abilities.*.abilities.insightfuldestiny.description",
          "signature_abilities.*.abilities.insightfulduration.description",
          "signature_abilities.*.abilities.insightfulinceff.description",
          "signature_abilities.*.abilities.insightfulreddiff.description",
          "signature_abilities.*.abilities.insightfulsetback.description",
          "signature_abilities.*.abilities.inventivecreationbasic.description",
          "signature_abilities.*.abilities.inventivecreationdestiny.description",
          "signature_abilities.*.abilities.inventivecreationdiff.description",
          "signature_abilities.*.abilities.inventivecreationrarity.description",
          "signature_abilities.*.abilities.inventivecreationscale.description",
          "signature_abilities.*.abilities.inventivecreationsetback.description",
          "signature_abilities.*.abilities.leverageui.description",
          "signature_abilities.*.abilities.losaddboost.description",
          "signature_abilities.*.abilities.losbasic.description",
          "signature_abilities.*.abilities.losdest.description",
          "signature_abilities.*.abilities.losincreaseeffect.description",
          "signature_abilities.*.abilities.losreducediff.description",
          "signature_abilities.*.abilities.losreducesetback.description",
          "signature_abilities.*.abilities.muchtolearnbasic.description",
          "signature_abilities.*.abilities.muchtolearnchangeskill1.description",
          "signature_abilities.*.abilities.muchtolearnchangeskill2.description",
          "signature_abilities.*.abilities.muchtolearndestiny.description",
          "signature_abilities.*.abilities.muchtolearnimprove.description",
          "signature_abilities.*.abilities.muchtolearnincreasenumber.description",
          "signature_abilities.*.abilities.muchtolearnreducedifficulty.description",
          "signature_abilities.*.abilities.muchtolearnsupreme.description",
          "signature_abilities.*.abilities.mycitybasic.description",
          "signature_abilities.*.abilities.mycityboostskill1.description",
          "signature_abilities.*.abilities.mycityboostskill2.description",
          "signature_abilities.*.abilities.mycitychangeskill1.description",
          "signature_abilities.*.abilities.mycitychangeskill2.description",
          "signature_abilities.*.abilities.mycitycoverupgrade.description",
          "signature_abilities.*.abilities.mycitydestiny.description",
          "signature_abilities.*.abilities.mycitydowngrade.description",
          "signature_abilities.*.abilities.mycityreducedifficulty.description",
          "signature_abilities.*.abilities.narrowescapebase.description",
          "signature_abilities.*.abilities.peerlessintercepactivatequal.description",
          "signature_abilities.*.abilities.peerlessintercepbase.description",
          "signature_abilities.*.abilities.peerlessintercepcritcount.description",
          "signature_abilities.*.abilities.peerlessintercepdestiny.description",
          "signature_abilities.*.abilities.peerlessintercepeffortcount.description",
          "signature_abilities.*.abilities.peerlessintercepincfrequ.description",
          "signature_abilities.*.abilities.peerlessintercepincreasedur.description",
          "signature_abilities.*.abilities.peerlessintercepreducestr.description",
          "signature_abilities.*.abilities.prophecybase.description",
          "signature_abilities.*.abilities.prophecydestiny.description",
          "signature_abilities.*.abilities.prophecydoom.description",
          "signature_abilities.*.abilities.prophecyflowofuniverse.description",
          "signature_abilities.*.abilities.prophecyrecur.description",
          "signature_abilities.*.abilities.prophecyreducediff.description",
          "signature_abilities.*.abilities.prophecyreducesetback.description",
          "signature_abilities.*.abilities.prophecysharedrev.description",
          "signature_abilities.*.abilities.reducedifficultyds.description",
          "signature_abilities.*.abilities.reducediffne.description",
          "signature_abilities.*.abilities.reducesbne.description",
          "signature_abilities.*.abilities.reducesetbackds.description",
          "signature_abilities.*.abilities.rousorbasic.description",
          "signature_abilities.*.abilities.rousorboostallies.description",
          "signature_abilities.*.abilities.rousorchangeskill.description",
          "signature_abilities.*.abilities.rousorchangeskill2.description",
          "signature_abilities.*.abilities.rousordestiny.description",
          "signature_abilities.*.abilities.rousorrecoverstrain.description",
          "signature_abilities.*.abilities.rousorreducediff.description",
          "signature_abilities.*.abilities.rousorreducesetback.description",
          "signature_abilities.*.abilities.rousorturningpoint.description",
          "signature_abilities.*.abilities.secretui.description",
          "signature_abilities.*.abilities.sharedluckuf.description",
          "signature_abilities.*.abilities.suddiscaddboost.description",
          "signature_abilities.*.abilities.suddiscbasic.description",
          "signature_abilities.*.abilities.suddiscchangeskill.description",
          "signature_abilities.*.abilities.suddiscdest.description",
          "signature_abilities.*.abilities.suddiscfreq.description",
          "signature_abilities.*.abilities.suddiscreducediff.description",
          "signature_abilities.*.abilities.suddiscreducesetback.description",
          "signature_abilities.*.abilities.thisoneisminebase.description",
          "signature_abilities.*.abilities.thisoneisminedest.description",
          "signature_abilities.*.abilities.thisoneisminedur.description",
          "signature_abilities.*.abilities.thisoneismineeva.description",
          "signature_abilities.*.abilities.thisoneisminefreq.description",
          "signature_abilities.*.abilities.thisoneisminesil.description",
          "signature_abilities.*.abilities.unexpecteddemisebasic.description",
          "signature_abilities.*.abilities.unexpecteddemisedestiny.description",
          "signature_abilities.*.abilities.unexpecteddemisedifficulty.description",
          "signature_abilities.*.abilities.unexpecteddemiseduration.description",
          "signature_abilities.*.abilities.unexpecteddemisesetback.description",
          "signature_abilities.*.abilities.unexpecteddemiseskill.description",
          "signature_abilities.*.abilities.unmatchauthbasic.description",
          "signature_abilities.*.abilities.unmatchauthdestiny.description",
          "signature_abilities.*.abilities.unmatchauthduration.description",
          "signature_abilities.*.abilities.unmatchauthendurance.description",
          "signature_abilities.*.abilities.unmatchauthfirmresolve.description",
          "signature_abilities.*.abilities.unmatchauthincreaseeffect.description",
          "signature_abilities.*.abilities.unmatchauthincreaseeffect2.description",
          "signature_abilities.*.abilities.unmatchauthmasscombat.description",
          "signature_abilities.*.abilities.unmatchedcalibrationacumen.description",
          "signature_abilities.*.abilities.unmatchedcalibrationbasic.description",
          "signature_abilities.*.abilities.unmatchedcalibrationdestiny.description",
          "signature_abilities.*.abilities.unmatchedcalibrationfrequency.description",
          "signature_abilities.*.abilities.unmatchedcalibrationnumber.description",
          "signature_abilities.*.abilities.unmatchedcalibrationoptimize.description",
          "signature_abilities.*.abilities.unmatchedcalibrationrisk.description",
          "signature_abilities.*.abilities.unmatchedcalibrationsetback.description",
          "signature_abilities.*.abilities.unmatchedcouragebasic.description",
          "signature_abilities.*.abilities.unmatchedcourageduration.description",
          "signature_abilities.*.abilities.unmatchedcourageeffect.description",
          "signature_abilities.*.abilities.unmatchedcouragefinish.description",
          "signature_abilities.*.abilities.unmatchedcouragesurvivor.description",
          "signature_abilities.*.abilities.unmatchedcouragethrough.description",
          "signature_abilities.*.abilities.unmatchedcouragetough.description",
          "signature_abilities.*.abilities.unmatcheddestinybase.description",
          "signature_abilities.*.abilities.unmatcheddestinydestiny.description",
          "signature_abilities.*.abilities.unmatcheddestinyfrequency.description",
          "signature_abilities.*.abilities.unmatcheddestinyincreasenumber.description",
          "signature_abilities.*.abilities.unmatcheddestinyshareddestiny.description",
          "signature_abilities.*.abilities.unmatcheddestinyunleashedpower.description",
          "signature_abilities.*.abilities.unmatcheddevastationbasic.description",
          "signature_abilities.*.abilities.unmatcheddevastationdrawandfire.description",
          "signature_abilities.*.abilities.unmatcheddevastationimprovemobility.description",
          "signature_abilities.*.abilities.unmatcheddevastationincreasenumber.description",
          "signature_abilities.*.abilities.unmatcheddevastationremovesetback.description",
          "signature_abilities.*.abilities.unmatcheddevastationtargetpriority.description",
          "signature_abilities.*.abilities.unmatchedferocitybase.description",
          "signature_abilities.*.abilities.unmatchedferocitychangetarget.description",
          "signature_abilities.*.abilities.unmatchedferocitydestiny.description",
          "signature_abilities.*.abilities.unmatchedferocityreduceconflict.description",
          "signature_abilities.*.abilities.unmatchedferocityreducestrain.description",
          "signature_abilities.*.abilities.unmatchedferocityskill1.description",
          "signature_abilities.*.abilities.unmatchedferocityskill2.description",
          "signature_abilities.*.abilities.unmatchedingenaddboost.description",
          "signature_abilities.*.abilities.unmatchedingenbase.description",
          "signature_abilities.*.abilities.unmatchedingendestiny.description",
          "signature_abilities.*.abilities.unmatchedingenduration.description",
          "signature_abilities.*.abilities.unmatchedingenquality.description",
          "signature_abilities.*.abilities.unmatchedingenquality2.description",
          "signature_abilities.*.abilities.unmatchedingenreducediff.description",
          "signature_abilities.*.abilities.unmatchedinsightbase.description",
          "signature_abilities.*.abilities.unmatchednegotiationaddtriumph.description",
          "signature_abilities.*.abilities.unmatchednegotiationbasic.description",
          "signature_abilities.*.abilities.unmatchednegotiationdestiny.description",
          "signature_abilities.*.abilities.unmatchednegotiationduration.description",
          "signature_abilities.*.abilities.unmatchednegotiationincreaseeffect.description",
          "signature_abilities.*.abilities.unmatchednegotiationincreaserange.description",
          "signature_abilities.*.abilities.unmatchednegotiationremovesetback.description",
          "signature_abilities.*.abilities.unmatchedpursuitbasic.description",
          "signature_abilities.*.abilities.unmatchedpursuitdestiny.description",
          "signature_abilities.*.abilities.unmatchedpursuitduration.description",
          "signature_abilities.*.abilities.unmatchedpursuitendurance.description",
          "signature_abilities.*.abilities.unmatchedpursuitfrequency.description",
          "signature_abilities.*.abilities.unmatchedpursuitmaneuver.description",
          "signature_abilities.*.abilities.unmatchedpursuitrange.description",
          "signature_abilities.*.abilities.unmatchedsurvbase.description",
          "signature_abilities.*.abilities.unmatchedsurvdest.description",
          "signature_abilities.*.abilities.unmatchedsurvdur.description",
          "signature_abilities.*.abilities.unmatchedsurvdura.description",
          "signature_abilities.*.abilities.unmatchedsurvfreq.description",
          "signature_abilities.*.abilities.unmatchedsurvreinf.description",
          "signature_abilities.*.abilities.unmatchedsurvsil.description",
          "signature_abilities.*.abilities.unmatchedteambase.description",
          "signature_abilities.*.abilities.unmatchedteamcamaraderie.description",
          "signature_abilities.*.abilities.unmatchedteamdestiny.description",
          "signature_abilities.*.abilities.unmatchedteamincreaserange.description",
          "signature_abilities.*.abilities.unmatchedteamincreasesuc.description",
          "signature_abilities.*.abilities.unmatchedteamincreasesucadv.description",
          "signature_abilities.*.abilities.unmatchedteamincreasetri.description",
          "signature_abilities.*.abilities.unmatchedteamremsetback.description",
          "signature_abilities.*.abilities.unmatchedtradebase.description",
          "signature_abilities.*.abilities.unmatchedtradedestiny.description",
          "signature_abilities.*.abilities.unmatchedtradeincreaseeffect1.description",
          "signature_abilities.*.abilities.unmatchedtradeincreaseeffect2.description",
          "signature_abilities.*.abilities.unmatchedtradeincreasenumber.description",
          "signature_abilities.*.abilities.unmatchedtradeskill1.description",
          "signature_abilities.*.abilities.unmatchedtradeskill2.description",
          "signature_abilities.*.abilities.unmatchedvigilancealwaysalert.description",
          "signature_abilities.*.abilities.unmatchedvigilancebasic.description",
          "signature_abilities.*.abilities.unmatchedvigilancecombatpreparation.description",
          "signature_abilities.*.abilities.unmatchedvigilancecombatreadiness.description",
          "signature_abilities.*.abilities.unmatchedvigilancedestiny.description",
          "signature_abilities.*.abilities.unmatchedvigilanceduration.description",
          "signature_abilities.*.abilities.unmatchedvigilancegrouppreparation.description",
          "signature_abilities.*.abilities.unmatchedvigilancegroupvigilance.description",
          "signature_abilities.*.abilities.unmatchexpdestiny.description",
          "signature_abilities.*.abilities.unmatchexpert.description",
          "signature_abilities.*.abilities.unmatchexpertact.description",
          "signature_abilities.*.abilities.unmatchexpertact2.description",
          "signature_abilities.*.abilities.unmatchexpertreddiff.description",
          "signature_abilities.*.abilities.unmatchexpertreddiff2.description",
          "signature_abilities.*.abilities.unmatchexpertredsetbk.description",
          "signature_abilities.*.abilities.unmatchexpertsupred.description",
          "signature_abilities.*.abilities.unmatchfortunebase.description",
          "signature_abilities.*.abilities.unmatchherobasic.description",
          "signature_abilities.*.abilities.unmatchherodestiny.description",
          "signature_abilities.*.abilities.unmatchheroduration.description",
          "signature_abilities.*.abilities.unmatchheroendurance.description",
          "signature_abilities.*.abilities.unmatchherofrequency.description",
          "signature_abilities.*.abilities.unmatchherorange.description",
          "signature_abilities.*.abilities.unmobbasic.description",
          "signature_abilities.*.abilities.unmobdest.description",
          "signature_abilities.*.abilities.unmobdur.description",
          "signature_abilities.*.abilities.unmobfreeman.description",
          "signature_abilities.*.abilities.unmobmdef.description",
          "signature_abilities.*.abilities.unmobrdef.description",
          "signature_abilities.*.abilities.unprotaddred.description",
          "signature_abilities.*.abilities.unprotally.description",
          "signature_abilities.*.abilities.unprotbasic.description",
          "signature_abilities.*.abilities.unprotdest.description",
          "signature_abilities.*.abilities.unprotduration.description",
          "signature_abilities.*.abilities.unprotsoak.description"
        ],
        "count": 274
      },
      {
        "kind": "Species",
        "files": [
          "canonical/species.json"
        ],
        "patterns": [
          "species.*.homeworld",
          "species.*.option_choices.[].options.[].description",
          "species.*.option_choices.[].options.[].special_abilities.[].description",
          "species.*.special_abilities.[].description"
        ],
        "count": 207
      },
      {
        "kind": "Crafting",
        "files": [
          "canonical/crafting_spend.json",
          "canonical/crafting_templates.json"
        ],
        "patterns": [
          "construction.on_failure.text",
          "construction.on_success_text",
          "construction.spend_order_note",
          "construction.stacking_default",
          "construction.time_rule_text",
          "spend.*.flaws.[].effect",
          "spend.*.improvements.[].effect",
          "templates.*.examples",
          "templates.*.result_profile.abilities.[].description",
          "templates.*.result_profile.base_mods.[].description"
        ],
        "count": 271
      },
      {
        "kind": "Item qualities",
        "files": [
          "canonical/qualities.vocab.json"
        ],
        "patterns": [
          "entries.[].description"
        ],
        "count": 32
      }
    ],
    "except": [
      [
        "vehicle-library/landspeeders.json",
        [
          "entries",
          24,
          "built_in_attachments",
          0,
          "description"
        ]
      ],
      [
        "vehicle-library/landspeeders.json",
        [
          "entries",
          65,
          "built_in_attachments",
          0,
          "description"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          5,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          9,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          15,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          26,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          27,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          30,
          "crew"
        ]
      ],
      [
        "vehicle-library/support.json",
        [
          "entries",
          34,
          "crew"
        ]
      ],
      [
        "vehicle-library/transports.json",
        [
          "entries",
          41,
          "built_in_attachments",
          0,
          "description"
        ]
      ],
      [
        "vehicle-library/walkers_tanks.json",
        [
          "entries",
          3,
          "crew"
        ]
      ]
    ],
    "total": 9758,
    "outside": {
      "npcs": 2689,
      "lore": 1396,
      "planets": 722,
      "respecialized": 447,
      "other": 413
    }
  };
  // END GENERATED RULE_TEXT_BLANKS

  function oggImport() {
    if (root && root.SWRPGOggImport) return root.SWRPGOggImport;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') return require('./oggImport.js');
    return null;
  }

  // ── XML: a small element parser (OggDude files are plain element trees: no namespaces, no mixed content) ────────
  // el = { tag, text, kids }. `text` is the element's own character data, entities decoded, as ElementTree's
  // `el.text` reads a leaf. A malformed file throws, and the caller skips it, as the census's ET.parse does.
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      var n = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(n);
    });
  }
  function parseXml(src) {
    var s = String(src).replace(/^﻿/, ''), i = 0, n = s.length;
    var top = { tag: '#doc', text: '', kids: [] }, stack = [top];
    while (i < n) {
      var lt = s.indexOf('<', i);
      if (lt < 0) lt = n;
      if (lt > i) { var cur = stack[stack.length - 1]; if (!cur.kids.length) cur.text += decodeEntities(s.slice(i, lt)); }
      if (lt >= n) break;
      if (s.startsWith('<!--', lt)) { var ce = s.indexOf('-->', lt + 4); if (ce < 0) throw new Error('xml: open comment'); i = ce + 3; continue; }
      if (s.startsWith('<![CDATA[', lt)) {
        var de = s.indexOf(']]>', lt + 9); if (de < 0) throw new Error('xml: open cdata');
        var c2 = stack[stack.length - 1]; if (!c2.kids.length) c2.text += s.slice(lt + 9, de); i = de + 3; continue;
      }
      if (s.startsWith('<?', lt) || s.startsWith('<!', lt)) { var pe = s.indexOf('>', lt); if (pe < 0) throw new Error('xml: open decl'); i = pe + 1; continue; }
      var gt = s.indexOf('>', lt);
      if (gt < 0) throw new Error('xml: open tag');
      var body = s.slice(lt + 1, gt);
      if (body.charAt(0) === '/') {
        var name = body.slice(1).trim(), open = stack.pop();
        if (!open || open.tag !== name || !stack.length) throw new Error('xml: mismatched </' + name + '>');
      } else {
        var self = body.charAt(body.length - 1) === '/';
        var tag = (self ? body.slice(0, -1) : body).trim().split(/\s/)[0];
        var el = { tag: tag, text: '', kids: [] };
        stack[stack.length - 1].kids.push(el);
        if (!self) stack.push(el);
      }
      i = gt + 1;
    }
    if (stack.length !== 1 || top.kids.length !== 1) throw new Error('xml: unbalanced');
    return top.kids[0];
  }
  function find(el, tag) {
    if (!el) return null;
    for (var i = 0; i < el.kids.length; i++) if (el.kids[i].tag === tag) return el.kids[i];
    return null;
  }
  function text(el) { return el ? String(el.text || '').trim() : ''; }
  function iter(el, tag, out) {
    out = out || [];
    if (!el) return out;
    if (el.tag === tag) out.push(el);
    el.kids.forEach(function (k) { iter(k, tag, out); });
    return out;
  }
  function miscdescs(el, tag) {
    var box = find(el, tag);
    return box ? box.kids.filter(function (m) { return find(m, 'MiscDesc'); }).map(function (m) { return text(find(m, 'MiscDesc')); }) : [];
  }

  // ── the dataset: which files, which root, which XML name ────────────────────────────────────────────────────────
  // A root is a folder holding an OggDude data file at its top (Talents.xml, Gear.xml …) or a Species/ or Vehicles/
  // folder. Several roots (a folder holding both Data/ and DataCustom/) are read DataCustom first, so its entry wins.
  var KNOWN = /^(talents|gear|weapons|armor|itemattachments|force abilities|sigabilitynodes|craftimprovements|crafttemplates|itemdescriptors|careers|specializations|skills|species|vehicles)(\.xml)?$/i;
  function rootsOf(paths) {
    var roots = {};
    paths.forEach(function (p) {
      var seg = p.split('/');
      for (var d = 0; d < seg.length - 1; d++) {
        var next = seg[d + 1], isDir = d + 1 < seg.length - 1;
        if (KNOWN.test(next) && (isDir ? /^(species|vehicles)$/i.test(next) : /\.xml$/i.test(next))) {
          roots[seg.slice(0, d + 1).join('/')] = 1;
        }
      }
      if (seg.length >= 1 && KNOWN.test(seg[0]) && (seg.length > 1 ? /^(species|vehicles)$/i.test(seg[0]) : /\.xml$/i.test(seg[0]))) roots[''] = 1;
    });
    return Object.keys(roots).sort(function (a, b) {
      var ca = /(^|\/)datacustom$/i.test(a) ? 0 : 1, cb = /(^|\/)datacustom$/i.test(b) ? 0 : 1;
      return ca - cb || a.length - b.length || (a < b ? -1 : 1);
    });
  }
  // files: [{ path: 'DataCustom/Talents.xml', text }] (the folder's relative paths, or a zip's entry names).
  // → { files, entries: { <xml name>: [{Key, el}] } } or null when no OggDude file is there.
  function readDataset(files) {
    var xml = (files || []).filter(function (f) { return /\.xml$/i.test(f.path); });
    var roots = rootsOf(xml.map(function (f) { return f.path; }));
    if (!roots.length) return null;
    var entries = {}, read = 0, taken = {};
    roots.forEach(function (r) {
      xml.forEach(function (f) {
        if (taken[f.path]) return;
        if (r && f.path.indexOf(r + '/') !== 0) return;
        var rel = r ? f.path.slice(r.length + 1) : f.path, seg = rel.split('/');
        if (roots.some(function (o) { return o !== r && o.length > r.length && f.path.indexOf(o + '/') === 0; })) return;
        taken[f.path] = 1; read += 1;
        var nested = seg.length > 1, name = nested ? seg[0] : seg[0].replace(/\.xml$/i, '');
        var el;
        try { el = parseXml(f.text); } catch (e) { return; }
        var items = nested && find(el, 'Key') ? [el] : el.kids;
        items.forEach(function (it) {
          var k = text(find(it, 'Key'));
          if (k) (entries[name] = entries[name] || []).push({ Key: k, el: it, root: r });
        });
      });
    });
    return { files: read, entries: entries };
  }
  // The dataset's (xml name → Key → element) index, through oggImport's indexBy: the first entry for a key wins, so
  // DataCustom's (read first) beats Data's.
  function indexDataset(ds) {
    var O = oggImport(), by = {};
    Object.keys(ds.entries).forEach(function (name) {
      var first = [], seen = {};
      ds.entries[name].forEach(function (e) { if (!seen[e.Key]) { seen[e.Key] = 1; first.push(e); } });
      by[name] = O && O.indexBy ? O.indexBy(first, 'Key') : first.reduce(function (o, e) { o[e.Key] = e; return o; }, {});
    });
    return by;
  }

  // ── markup: OggDude tags → the app's codes through the shipped glyph table (P-3) ───────────────────────────────
  // charbuild.decode_markup, in the page: headings dropped, [P]/[BR] → newline, bold/italic pairs unwrapped, a glyph
  // tag → its canonical [XX]. An unknown tag is DROPPED and counted (P-3).
  function glyphMap(vocab) {
    var m = {};
    ((vocab && vocab.entries) || []).forEach(function (e) {
      [e.token].concat(e.aliases || []).forEach(function (a) { if (a) m[String(a).toUpperCase()] = e.token; });
    });
    return m;
  }
  // R-ART-1: the one markup table (schema/vocab/markup_adjudications.json, item_markup.py's too) → { token: entry },
  // CASE-EXACT; never a literal copy of its entries here (T2)
  function markupMap(doc) {
    var m = {};
    ((doc && doc.entries) || []).forEach(function (e) { if (e && e.token) m[e.token] = e; });
    return m;
  }
  // R-ART-2: headings, paragraphs and the bold/italic pairs first; then each [tok] in the table, case-exact, BEFORE the
  // glyph vocab — word keeps [tok], glyph becomes [glyph], drop removes it and counts it; a miss in both is dropped and
  // counted. `markup` is markupMap's result.
  function decodeMarkup(t, glyphs, drop, markup) {
    if (!t) return '';
    markup = markup || {};
    t = String(t).replace(/\[H\d\][\s\S]*?\[h\d\]\s*/gi, '').replace(/\[(p|br)\]/gi, '\n')
      .replace(/\[B\]([\s\S]*?)\[b\]/g, '$1').replace(/\[I\]([\s\S]*?)\[i\]/g, '$1').replace(/\[[BbIi]\]/g, '');
    t = t.replace(/\[([^\[\]]+)\]/g, function (m, tok) {
      if (tok === '11') return '';
      var a = Object.prototype.hasOwnProperty.call(markup, tok) ? markup[tok] : null;
      if (a && a.as === 'word') return m;
      if (a && a.as === 'glyph') return '[' + a.glyph + ']';
      if (a && a.as === 'drop') { drop[tok] = (drop[tok] || 0) + 1; return ''; }
      var g = glyphs[String(tok).toUpperCase()];
      if (g) return '[' + g + ']';
      drop[tok] = (drop[tok] || 0) + 1;
      return '';
    });
    return t.trim();
  }

  // R-A5C-7a/7b: a placeholder is a {0} slot, or — past its [H3]/[H4] title and its tags — empty, without a word of
  // three letters, or opening with "Please see" / "See page".
  function isPlaceholder(t) {
    if (String(t).indexOf('{0}') >= 0) return true;
    var s = String(t).replace(/\[H[34]\][\s\S]*?\[h[34]\]/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
    return !/[A-Za-z]{3,}/.test(s) || /^(please\s+see\b|see\s+page)/i.test(s);
  }

  // ── the blanks: walk the records at a kind's patterns, less the exceptions (ADDENDUM 5 Q1 (a)) ─────────────────
  function walk(node, steps, at, out) {
    if (!steps.length) { out.push({ path: at, value: node }); return out; }
    var h = steps[0], rest = steps.slice(1);
    if (h === '[]') { if (Array.isArray(node)) node.forEach(function (v, i) { walk(v, rest, at.concat([i]), out); }); }
    else if (h === '*') { if (node && typeof node === 'object' && !Array.isArray(node)) Object.keys(node).forEach(function (k) { walk(node[k], rest, at.concat([k]), out); }); }
    else if (node && typeof node === 'object' && !Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, h)) walk(node[h], rest, at.concat([h]), out);
    return out;
  }
  // docs: { '<public/data-relative file>': <the file's parsed JSON> } — what the panel's loader holds.
  // → { rows: [{kind, file, path}], counted: {kind: n}, stale: [kinds whose count differs from the block] }
  function blanksOf(docs, blanks) {
    blanks = blanks || RULE_TEXT_BLANKS;
    var skip = {};
    (blanks.except || []).forEach(function (e) { skip[e[0] + '\u0000' + JSON.stringify(e[1])] = 1; });
    var rows = [], counted = {}, stale = [];
    (blanks.kinds || []).forEach(function (k) {
      var n = 0;
      k.files.forEach(function (f) {
        var doc = docs && docs[f];
        if (doc == null) return;
        k.patterns.forEach(function (p) {
          walk(doc, p.split('.'), [], []).forEach(function (hit) {
            if (hit.value !== '' || skip[f + '\u0000' + JSON.stringify(hit.path)]) return;
            rows.push({ kind: k.kind, file: f, path: hit.path }); n += 1;
          });
        });
      });
      counted[k.kind] = n;
      if (n !== k.count) stale.push(k.kind);
    });
    return { rows: rows, counted: counted, stale: stale };
  }

  // The fill address the accessor reads: '<kind>|<record id>|<field path>'. Kinds: a canonical map file's section
  // (talents, gear, weapons, armor, attachments, vehicle_attachments, force_powers, signature_abilities, species,
  // templates); 'qualities' (an entry's id); 'spend' (an improvement or flaw row's own id); 'vehicles' (an entry's key).
  function address(file, path, docs) {
    var doc = docs[file];
    if (file === 'canonical/qualities.vocab.json') return 'qualities|' + doc.entries[path[1]].id + '|' + path.slice(2).join('.');
    if (file === 'canonical/crafting_spend.json') return 'spend|' + doc.spend[path[1]][path[2]][path[3]].id + '|' + path.slice(4).join('.');
    if (file.indexOf('vehicle-library/') === 0) return 'vehicles|' + doc.entries[path[1]].key + '|' + path.slice(2).join('.');
    if (file === 'canonical/crafting_templates.json' && path[0] !== 'templates') return 'templates|' + path.join('.') + '|';
    return path[0] + '|' + path[1] + '|' + path.slice(2).join('.');
  }
  function addressKey(kind, id, sub) { return kind + '|' + id + '|' + (Array.isArray(sub) ? sub.join('.') : String(sub == null ? '' : sub)); }

  var XMLNAME = {
    'canonical/talents.json': 'Talents', 'canonical/gear.json': 'Gear', 'canonical/weapons.json': 'Weapons',
    'canonical/armor.json': 'Armor', 'canonical/attachments.json': 'ItemAttachments',
    'canonical/vehicle-attachments.json': 'ItemAttachments', 'canonical/force_powers.json': 'Force Abilities',
    'canonical/signature_abilities.json': 'SigAbilityNodes', 'canonical/species.json': 'Species',
    'canonical/crafting_spend.json': 'CraftImprovements', 'canonical/crafting_templates.json': 'CraftTemplates',
    'canonical/qualities.vocab.json': 'ItemDescriptors',
  };

  // judge(row, docs, get) → [reason, dataset text or null]. The census's `judge`, line for line (Appendix A,
  // R-A5C-7d for crafting templates, R-A5C-4's carried option keys for species).
  function judge(row, docs, get) {
    var f = row.file, p = row.path, doc = docs[f];
    function src(t) { return isPlaceholder(t) ? [PH, null] : [FILL, t]; }
    if (f.indexOf('vehicle-library/') === 0) {
      var vr = doc.entries[p[1]], e = get('Vehicles', vr.key);
      if (!e) return [NID, null];
      var tail = p.slice(2);
      if (tail.length === 1 && tail[0] === 'description') return src(text(find(e, 'Description')));
      if (tail.length === 1 && tail[0] === 'crew') return src(text(find(e, 'Crew')));
      if (tail.length === 1 && tail[0] === 'starfighter_complement') return src(text(find(e, 'StarFighters')));
      if (tail[0] === 'base_mods') { var bl = miscdescs(e, 'BaseMods'); return tail[1] < bl.length ? src(bl[tail[1]]) : [NID, null]; }
      if (tail[0] === 'built_in_attachments') {
        var ae = get('ItemAttachments', (vr.built_in_attachments[tail[1]] || {}).key);
        return ae ? src(text(find(ae, 'Description'))) : [NID, null];
      }
      return [CANT, null];
    }
    var xmlname = XMLNAME[f];
    if (f === 'canonical/qualities.vocab.json') {
      var q = doc.entries[p[1]], qe = null;
      [String(q.id || '').toUpperCase()].concat(q.aliases || []).forEach(function (k) { qe = qe || get(xmlname, k); });
      return qe ? src(text(find(qe, 'Description'))) : [NID, null];
    }
    if (f === 'canonical/crafting_spend.json') {
      var sr = doc.spend[p[1]][p[2]][p[3]], se = get(xmlname, sr.ogg_key);
      if (!se) return [NID, null];
      if (iter(se, 'MiscDesc').some(function (m) { return String(m.text || '').indexOf('{0}') >= 0; })) return [PH, null];
      return src(text(find(se, 'Description')));
    }
    if (f === 'canonical/crafting_templates.json') {
      if (p[0] !== 'templates') return [CANT, null];                                      // R-A5C-7d: our own rule text
      var keys = doc.templates[p[1]].ogg_keys || [];
      return keys.length && get(xmlname, keys[0]) ? [CANT, null] : [NID, null];             // R-A5C-3 / 7d
    }
    var rec = doc[p[0]][p[1]], key = rec._source_key;
    if (!key) return [NID, null];
    var el = get(xmlname, key);
    if (f === 'canonical/force_powers.json' || f === 'canonical/signature_abilities.json') {
      var ab = get(xmlname, String(p[3]).toUpperCase());
      return ab ? src(text(find(ab, 'Description'))) : [NID, null];
    }
    if (!el) return [NID, null];
    var t2 = p.slice(2);
    if (t2.length === 1 && t2[0] === 'description') return src(text(find(el, 'Description')));
    if (t2[0] === 'pool_mods') return [CANT, null];                                            // R-A5C-3
    if (t2[0] === 'base_mods' || t2[0] === 'added_mods') {
      var ml = miscdescs(el, t2[0] === 'base_mods' ? 'BaseMods' : 'AddedMods');
      return t2[1] < ml.length ? src(ml[t2[1]]) : [NID, null];                                  // R-A5C-7c
    }
    if (f === 'canonical/species.json') return species(rec, t2, el);
    return [NID, null];
  }
  // R-A5C-4: a species ability or option joins by its OWN carried OggDude key (`_source_key`), found among the
  // species file's <Option> elements. No name matching (P-2).
  function species(rec, tail, el) {
    function byKey(k) {
      if (!k) return null;
      var hit = iter(el, 'Option').filter(function (o) { return text(find(o, 'Key')) === k; });
      return hit[0] || null;
    }
    function src(t) { return isPlaceholder(t) ? [PH, null] : [FILL, t]; }
    var o = null;
    if (tail[0] === 'special_abilities') o = byKey((rec.special_abilities[tail[1]] || {})._source_key);
    else if (tail[0] === 'option_choices') {
      var opt = rec.option_choices[tail[1]].options[tail[3]];
      o = tail.length === 5 ? byKey(opt._source_key) : byKey(((opt.special_abilities || [])[tail[5]] || {})._source_key);
    }
    return o ? src(text(find(o, 'Description'))) : [NID, null];
  }

  // run(docs, files, opts) — THE IMPORT. files: [{path, text}]; opts: { name, glyphs (glyphs.vocab.json),
  // markup (markup_adjudications.json, REQUIRED: R-ART-5, a call without it throws), blanks }.
  // → { fills, report } · report.error 'no-files' when no OggDude file is in the pick. A stale block (a kind's walk
  // differs from its count) fills NOTHING (ADDENDUM 5 Q1 (a)) and says so in report.stale.
  function run(docs, files, opts) {
    opts = opts || {};
    if (!opts.markup || !Array.isArray(opts.markup.entries)) throw new Error('rule text: no markup table');
    var blanks = opts.blanks || RULE_TEXT_BLANKS, ds = readDataset(files);
    if (!ds) return { fills: {}, report: { error: 'no-files', name: opts.name || '' } };
    var idx = indexDataset(ds), O = oggImport(), alias = (O && O.KEY_ALIASES) || {};
    function get(name, key) {
      if (!key) return null;
      var by = idx[name] || {}, hit = by[alias[key] || key] || by[key];
      return hit ? hit.el : null;
    }
    var b = blanksOf(docs, blanks), glyphs = glyphMap(opts.glyphs), markup = markupMap(opts.markup), drop = {};
    var kinds = {}, fills = {}, filled = 0;
    (blanks.kinds || []).forEach(function (k) { kinds[k.kind] = { kind: k.kind, filled: 0, of: k.count, by: {} }; });
    if (!b.stale.length) {
      b.rows.forEach(function (row) {
        var j = judge(row, docs, get), k = kinds[row.kind];
        if (j[0] === FILL) {
          var t = decodeMarkup(j[1], glyphs, drop, markup);
          if (t) { fills[address(row.file, row.path, docs)] = t; k.filled += 1; filled += 1; return; }
          j = [PH, null];
        }
        k.by[j[0]] = (k.by[j[0]] || 0) + 1;
      });
    }
    var out = (blanks.kinds || []).map(function (k) {
      var r = kinds[k.kind], order = [];
      Object.keys(r.by).forEach(function (reason) { order.push([reason, r.by[reason]]); });
      // the largest reason first; a tie in a fixed order (placeholder, can't place, not in, not a format), as M5 draws
      var TIE = [PH, CANT, NID, NFMT];
      order.sort(function (a, c) { return c[1] - a[1] || TIE.indexOf(a[0]) - TIE.indexOf(c[0]); });
      return { kind: r.kind, filled: r.filled, of: r.of, reasons: order };
    });
    return {
      fills: b.stale.length ? {} : fills,
      report: { name: opts.name || '', files: ds.files, total: blanks.total || 0, filled: b.stale.length ? 0 : filled,
        stale: b.stale, kinds: out, outside: blanks.outside || {}, dropped: drop },
    };
  }

  // ── a zip, opened with the platform's DecompressionStream (no library) ──────────────────────────────────────────
  // → Promise<[{path, text}]>. Stored (0) and deflated (8) entries; anything else, or no central directory, rejects.
  function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('zip: no central directory'));
    var count = dv.getUint16(eocd + 10, true), at = dv.getUint32(eocd + 16, true), list = [];
    var utf8 = new TextDecoder('utf-8');
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(at, true) !== 0x02014b50) return Promise.reject(new Error('zip: bad central entry'));
      var method = dv.getUint16(at + 10, true), csize = dv.getUint32(at + 20, true), nlen = dv.getUint16(at + 28, true),
        xlen = dv.getUint16(at + 30, true), clen = dv.getUint16(at + 32, true), loc = dv.getUint32(at + 42, true);
      var name = utf8.decode(u8.subarray(at + 46, at + 46 + nlen)).replace(/\\/g, '/');
      at += 46 + nlen + xlen + clen;
      if (/\/$/.test(name) || !/\.xml$/i.test(name) || /(^|\/)__MACOSX\//.test(name)) continue;
      if (dv.getUint32(loc, true) !== 0x04034b50) return Promise.reject(new Error('zip: bad local entry'));
      var start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      list.push({ path: name, method: method, data: u8.subarray(start, start + csize) });
    }
    return Promise.all(list.map(function (z) {
      if (z.method === 0) return Promise.resolve({ path: z.path, text: utf8.decode(z.data) });
      if (z.method !== 8) return Promise.reject(new Error('zip: method ' + z.method));
      var ds = new DecompressionStream('deflate-raw');
      var out = new Blob([z.data]).stream().pipeThrough(ds);
      return new Response(out).arrayBuffer().then(function (ab) { return { path: z.path, text: utf8.decode(new Uint8Array(ab)) }; });
    }));
  }

  var api = {
    REASONS: REASONS, PH: PH, NID: NID, NFMT: NFMT, CANT: CANT, RULE_TEXT_BLANKS: RULE_TEXT_BLANKS,
    parseXml: parseXml, readDataset: readDataset, isPlaceholder: isPlaceholder, decodeMarkup: decodeMarkup,
    glyphMap: glyphMap, markupMap: markupMap, blanksOf: blanksOf, address: address, addressKey: addressKey, run: run, unzip: unzip,
  };
  if (root) root.SWRPGRuleText = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
