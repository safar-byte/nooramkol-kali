import { MAX_SCORE, STICK_POINTS } from '../../game/constants.js';
import Dialog from '../Dialog.jsx';

export default function RulesDialog({ t, foulEndsRound, onClose }) {
  return (
    <Dialog title={t('rulesTitle')} onClose={onClose} className="dialog-wide">
      <ol className="rules-steps">
        {t('rulesSteps').map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="rules-callout">{foulEndsRound ? t('rulesFoulStrict') : t('rulesFoulDefault')}</p>

      <h3 className="rules-subtitle">{t('scoringTitle')}</h3>
      <table className="rules-table">
        <tbody>
          <tr>
            <th scope="row">{t('scoreSmall')}</th>
            <td>+{STICK_POINTS.small}</td>
          </tr>
          <tr>
            <th scope="row">{t('scoreLarge')}</th>
            <td>+{STICK_POINTS.large}</td>
          </tr>
          <tr>
            <th scope="row">{t('scoreFoul')}</th>
            <td>0</td>
          </tr>
          <tr>
            <th scope="row">Maximum</th>
            <td>{MAX_SCORE}</td>
          </tr>
        </tbody>
      </table>
      <p className="rules-note">{t('rulesNote')}</p>
      <p className="rules-note">{t('helpKeyboard')}</p>

      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          {t('close')}
        </button>
      </div>
    </Dialog>
  );
}
