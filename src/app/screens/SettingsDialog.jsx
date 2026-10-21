import Dialog from '../Dialog.jsx';

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export default function SettingsDialog({ t, settings, updateSettings, onClose }) {
  return (
    <Dialog title={t('settings')} onClose={onClose}>
      <div className="settings-list">
        <Toggle
          label={t('soundEffects')}
          checked={settings.soundEnabled}
          onChange={(soundEnabled) => updateSettings({ soundEnabled })}
        />
        <Toggle
          label={t('reducedMotion')}
          checked={settings.reducedMotion}
          onChange={(reducedMotion) => updateSettings({ reducedMotion })}
        />
        <Toggle label={t('hintsSetting')} checked={settings.hints} onChange={(hints) => updateSettings({ hints })} />

        <fieldset className="settings-group">
          <legend>{t('language')}</legend>
          <label className="radio">
            <input
              type="radio"
              name="language"
              checked={settings.language === 'en'}
              onChange={() => updateSettings({ language: 'en' })}
            />
            English
          </label>
          <label className="radio">
            <input
              type="radio"
              name="language"
              checked={settings.language === 'ml'}
              onChange={() => updateSettings({ language: 'ml' })}
            />
            <span lang="ml">മലയാളം</span> (beta)
          </label>
          <p className="settings-note">{t('malayalamNote')}</p>
        </fieldset>

        <fieldset className="settings-group">
          <legend>{t('foulRule')}</legend>
          <label className="radio">
            <input
              type="radio"
              name="foul-rule"
              checked={!settings.foulEndsRound}
              onChange={() => updateSettings({ foulEndsRound: false })}
            />
            {t('foulRuleRetry')}
          </label>
          <label className="radio">
            <input
              type="radio"
              name="foul-rule"
              checked={settings.foulEndsRound}
              onChange={() => updateSettings({ foulEndsRound: true })}
            />
            {t('foulRuleEnd')}
          </label>
        </fieldset>

        <Toggle
          label={t('debugOverlay')}
          checked={settings.debugOverlay}
          onChange={(debugOverlay) => updateSettings({ debugOverlay })}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </Dialog>
  );
}
