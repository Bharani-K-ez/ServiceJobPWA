/**
 * The in-iframe half of the postMessage bridge between a rendered document
 * template (public/templates/*.html, running inside DocumentFormPage.tsx's
 * same-origin iframe) and the React host.
 *
 * Ported from the legacy MAUI app's WebView<->C# bridge: the old templates
 * call a native-supplied `invokeCSharpAction(jsonString)` function to ask
 * the host to do something it can't do itself (open the camera, capture a
 * signature). There is no native host anymore, so this script defines that
 * same function itself and forwards the call to the React parent via
 * `window.postMessage` instead - the template code (see work_docket.html's
 * own `$("button.add-image").click(...)` and `invokeCSCode()`) is otherwise
 * unchanged from the legacy version.
 *
 * Every message this script sends or receives is tagged `docBridge: true`
 * so DocumentFormPage's window 'message' listener can tell a real bridge
 * message apart from anything else that might postMessage into the page
 * (e.g. browser extensions, Ionic/Capacitor's own internals).
 */
export function buildBridgeScript(): string {
  const js = `
(function () {
  function post(msg) {
    window.parent.postMessage(Object.assign({ docBridge: true }, msg), '*');
  }

  // Legacy templates call this directly (see work_docket.html's add-image
  // click handler and invokeCSCode()). The payload shape is whatever that
  // template already builds - we just forward it up rather than trying to
  // interpret every possible TriggerFor value here, so a future template
  // that invents a new TriggerFor doesn't need this file to change too.
  window.invokeCSharpAction = function (dataJsonStr) {
    var payload;
    try {
      payload = JSON.parse(dataJsonStr);
    } catch (err) {
      payload = { raw: dataJsonStr };
    }
    post({ action: 'invokeCSharpAction', payload: payload });
  };

  // Messages arriving FROM the parent (DocumentFormPage.tsx), answering an
  // invokeCSharpAction request above.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.docBridge !== true || data.action === 'invokeCSharpAction') return;

    if (data.action === 'imageResult' && data.imageKey && typeof data.dataUrl === 'string') {
      // Setting .src on the template's own hidden <img id="{imageKey}"> is
      // all that's needed - work_docket.html's onload="syncSourceToModel(this)"
      // (already present in the template, not added by us) pushes it into
      // the Angular scope's data[key] array itself. See that function's
      // definition for the full push+$apply logic; we don't duplicate it
      // here on purpose, so a future template that wires an image slot up
      // the same way needs no bridge changes.
      var imgEl = document.getElementById(data.imageKey);
      if (imgEl) imgEl.setAttribute('src', data.dataUrl);
      return;
    }

    if (data.action === 'setSignature' && data.role) {
      // Unlike the image-picker slots above, the two signature <img>s in
      // work_docket.html are plain {Token}-substituted at load (see that
      // file's own comment above docEngineerSignatureImg/
      // docCustomerSignatureImg) - there is no onload hook to piggyback on,
      // so this sets the image directly AND pushes the printed name/date
      // into the Angular scope itself, then $apply()s so the {{ data.x }}
      // bindings (company_sign/customer_sign/sign_date) pick it up.
      var imgId = data.role === 'engineer' ? 'docEngineerSignatureImg' : 'docCustomerSignatureImg';
      var sigImg = document.getElementById(imgId);
      if (sigImg && typeof data.dataUrl === 'string') sigImg.setAttribute('src', data.dataUrl);

      if (window.angular) {
        var scope = window.angular.element('#inspection-form').scope();
        if (scope) {
          scope.$apply(function () {
            if (data.role === 'engineer') {
              scope.data.company_sign = data.printedName || '';
            } else {
              scope.data.customer_sign = data.printedName || '';
            }
            scope.data.sign_date = data.dateStr || scope.data.sign_date || '';
          });
        }
      }
      return;
    }

    if (data.action === 'toggleReportMode' && window.jQuery) {
      // Equivalent of FormHelper.toggleDisplay() (see work_docket.html) but
      // callable from the parent without needing fHelper exposed on
      // window - jQuery already is (it's a vendored global script), so this
      // just does the same show/hide directly.
      if (data.isReport) {
        window.jQuery('.c-edit').hide();
        window.jQuery('.c-disp').show();
      } else {
        window.jQuery('.c-edit').show();
        window.jQuery('.c-disp').hide();
      }
      return;
    }
  });

  post({ action: 'bridgeReady' });
})();
`
  return `<script>${js}</script>`
}
