const reportForm = document.getElementById('report-form');
const reportFields = document.getElementById('report-fields');
const reportMessage = document.getElementById('report-message');
const categorySelect = document.getElementById('category');
const dateInput = document.getElementById('event-date');
const retrySetup = document.getElementById('report-retry');
const editParams = new URLSearchParams(location.search);
const editing = editParams.has('edit');
const editId = editParams.get('edit');
const existingPhoto = document.getElementById('existing-photo');
let formOwner = null, editVersion = null, existingPhotoPath = null, setupVersion = 0, dirty = false;
if (editing) {
    document.title = 'Edit report | DolFind';
    document.getElementById('report-title').textContent = 'Edit your report';
    document.getElementById('report-intro').textContent = 'Saving sends this report back for approval and hides it from public listings until approved again.';
    document.getElementById('submit-report').textContent = 'Save and send for approval';
    document.getElementById('report-another').hidden = true;
    const back = document.getElementById('report-back'); back.href = 'my-reports.html'; back.textContent = 'Back to my reports';
    document.getElementById('report-login').href = 'login.html?next=' + encodeURIComponent('report.html?edit=' + encodeURIComponent(editId));
}
let submitting = false;
let selectedPhoto = null;
let previewUrl = null;
let preparingPhoto = false;
let photoVersion = 0;
const photoInput = document.getElementById('report-photo');
const photoPreview = document.getElementById('photo-preview');
const photoMessage = document.getElementById('photo-message');
const descriptionInput = document.getElementById('description');
function updateDescriptionCount() {
    document.getElementById('description-count').textContent = `${descriptionInput.value.length} / 1,000 characters`;
}
descriptionInput.addEventListener('input', updateDescriptionCount);
const contactMethod = document.getElementById('contact-method');
const contactValue = document.getElementById('contact-value');
const contactConsent = document.getElementById('contact-consent');
function updateContactFields() {
    const method = contactMethod.value;
    document.getElementById('contact-fields').hidden = !method;
    contactValue.disabled = !method; contactValue.required = Boolean(method);
    contactConsent.disabled = !method; contactConsent.required = Boolean(method);
    contactValue.value = ''; contactConsent.checked = false;
    const labels = { email: ['School email', 'your.name@pcu.edu.ph', 'Enter the school email you want people to use.'], messenger: ['Messenger / Facebook profile link', 'https://m.me/your.username', 'Paste a full HTTPS profile link from m.me, messenger.com/t/, or facebook.com.'], phone: ['Mobile number', '09123456789', 'Use a Philippine mobile number beginning with 09 or +639.'] };
    const details = labels[method] || ['Contact details', '', ''];
    document.getElementById('contact-value-label').textContent = details[0];
    contactValue.placeholder = details[1];
    contactValue.type = method === 'email' ? 'email' : method === 'phone' ? 'tel' : 'url';
    document.getElementById('contact-help').textContent = details[2];
}
contactMethod.addEventListener('change', updateContactFields);

function clearPhoto() {
    photoVersion++;
    preparingPhoto = false;
    selectedPhoto = null;
    photoInput.value = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoPreview.removeAttribute('src');
    photoPreview.hidden = true;
    document.getElementById('remove-photo').hidden = !existingPhotoPath;
    existingPhoto.hidden = !existingPhotoPath;
    photoMessage.textContent = 'Optional · JPG, PNG or WebP · Up to 2 MB';
}
photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    clearPhoto();
    if (!file) return;
    const version = photoVersion;
    preparingPhoto = true;
    photoMessage.textContent = 'Preparing photo…';
    try {
        const blob = await window.reportPhotos.compress(file);
        if (version !== photoVersion) return;
        selectedPhoto = blob;
        existingPhoto.hidden = true;
        previewUrl = URL.createObjectURL(blob);
        photoPreview.src = previewUrl;
        photoPreview.hidden = false;
        document.getElementById('remove-photo').hidden = false;
        photoMessage.textContent = `${file.name} · Ready to upload (${Math.ceil(blob.size / 1024)} KB)`;
    } catch (error) {
        if (version === photoVersion) photoMessage.textContent = error.message;
    } finally { if (version === photoVersion) preparingPhoto = false; }
});
document.getElementById('remove-photo').addEventListener('click', () => {
    existingPhotoPath = null; existingPhoto.replaceChildren(); clearPhoto(); dirty = true;
});

function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
dateInput.max = localToday();

function reportNotice(message, type = '') {
    reportMessage.textContent = message;
    reportMessage.className = `message ${type}`;
}

async function prepareReport() {
    const request = ++setupVersion;
    if (editing && !/^[1-9]\d{0,18}$/.test(editId || '')) { reportNotice('This report link is invalid.', 'error'); return; }
    retrySetup.hidden = true;
    reportFields.disabled = true;
    document.getElementById('report-login').hidden = true;
    reportNotice('Checking your account…');
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (request !== setupVersion) return;
        if (!data?.user) {
            reportNotice('Please log in before reporting an item.');
            document.getElementById('report-login').hidden = false;
            retrySetup.hidden = false;
            return;
        }
        if (error) throw error;
        formOwner = data.user.id;
        const { data: categories, error: categoryError } = await window.supabaseClient
            .from('categories').select('id,name').order('name');
        if (request !== setupVersion) return;
        if (categoryError) throw categoryError;
        if (!categories?.length) throw new Error('No categories are available. Please contact the administrator.');
        categorySelect.replaceChildren(new Option('Choose a category', ''));
        categories.forEach(category => categorySelect.add(new Option(category.name, category.id)));
        if (editing) {
            const saved = await window.ownedReports.get(editId, formOwner);
            if (request !== setupVersion) return;
            if (saved.report.status === 'claimed') throw new Error('Returned reports cannot be edited. Go back to My reports.');
            editVersion = saved.version;
            const item = saved.report;
            document.getElementById('item-title').value = item.title;
            descriptionInput.value = item.description;
            document.getElementById('location').value = item.location;
            document.getElementById('item-type').value = item.item_type;
            categorySelect.value = String(item.category_id);
            dateInput.value = item.event_date;
            existingPhotoPath = item.image_url || null;
            clearPhoto(); existingPhoto.replaceChildren();
            if (existingPhotoPath) window.reportPhotos.mount(existingPhoto, item);
            contactMethod.value = saved.contact?.method || '';
            updateContactFields();
            contactValue.value = saved.contact?.value || '';
            updateDescriptionCount(); dirty = false;
        }
        reportFields.disabled = false;
        reportNotice(editing ? 'Review your details and confirm consent if you are sharing contact information.' : 'The photo and contact details are optional. All other fields are required.');
    } catch (error) {
        if (request !== setupVersion) return;
        reportNotice(`Could not prepare the form: ${error.message}`, 'error');
        retrySetup.hidden = false;
    }
}

reportForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || reportFields.disabled || !formOwner || (editing && !editVersion) || !reportForm.reportValidity()) return;
    if (preparingPhoto) { reportNotice('Please wait while your photo is prepared.'); return; }
    const title = document.getElementById('item-title').value.trim();
    const description = document.getElementById('description').value.trim();
    const location = document.getElementById('location').value.trim();
    const itemType = document.getElementById('item-type').value;
    if (title.length < 3 || description.length < 10 || location.length < 2) {
        reportNotice('Please provide an item name, a description of at least 10 characters, and a location. Spaces alone do not count.', 'error');
        return;
    }
    if (!['lost', 'found'].includes(itemType) || dateInput.value > localToday()) {
        reportNotice('Choose lost or found and a date that is not in the future.', 'error');
        return;
    }
    let contact;
    try {
        contact = window.reportContact.normalize(contactMethod.value, contactValue.value);
        if (contact && !contactConsent.checked) throw new Error('Please agree to share your contact details or choose not to share them.');
    } catch (error) { reportNotice(error.message, 'error'); contactValue.focus(); return; }
    submitting = true;
    const operation = setupVersion;
    reportFields.disabled = true;
    reportNotice('Submitting your report…');
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (operation !== setupVersion) return;
        if (error || !data?.user) {
            document.getElementById('report-login').hidden = false;
            throw new Error('Your session could not be verified. Log in again, then return to this form.');
        }
        if (data.user.id !== formOwner) throw new Error('Your account changed. Reload this form before saving.');
        if (contact && !window.reportContact.eligible(data.user)) throw new Error('A confirmed @pcu.edu.ph account is required to share contact details.');
        let photoPath = existingPhotoPath;
        if (selectedPhoto) {
            reportNotice('Uploading your photo…');
            photoPath = await window.reportPhotos.upload(selectedPhoto, data.user.id);
        }
        if (operation !== setupVersion) return;
        reportNotice('Saving your report…');
        const report = {
            user_id: data.user.id,
            category_id: Number(categorySelect.value),
            title, description, location,
            item_type: itemType,
            event_date: dateInput.value,
            status: 'pending',
            image_url: photoPath
        };
        const response = editing
            ? await window.ownedReports.save(editId, formOwner, editVersion, report, contact, contactConsent.checked)
            : await window.reportContact.submit(report, contact, contactConsent.checked);
        if (operation !== setupVersion) return;
        const insertError = response.error;
        if (insertError) {
            if (contact && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(insertError.code)) {
                throw new Error('Contact sharing is not set up yet. Ask the administrator to run report-contacts.sql, or submit without contact details');
            }
            throw insertError;
        }
        reportForm.reset();
        dirty = false; existingPhotoPath = null; existingPhoto.replaceChildren();
        updateContactFields();
        updateDescriptionCount();
        clearPhoto();
        reportForm.hidden = true;
        document.getElementById('report-success').hidden = false;
        reportNotice(editing ? 'Changes saved. Your report is pending approval again.' : 'Report submitted successfully!', 'success');
    } catch (error) {
        if (operation !== setupVersion) return;
        reportNotice(`Save could not be confirmed: ${error.message}. Your entries have been kept. Check My reports before retrying if your connection dropped.`, 'error');
    } finally {
        submitting = false;
        if (operation === setupVersion) reportFields.disabled = false;
    }
});

retrySetup.addEventListener('click', prepareReport);
document.getElementById('report-another').addEventListener('click', () => {
    document.getElementById('report-success').hidden = true;
    reportForm.hidden = false;
    prepareReport();
});
reportForm.addEventListener('input', () => { dirty = true; });
reportForm.addEventListener('change', () => { dirty = true; });
window.addEventListener('beforeunload', event => {
    if (dirty && !submitting) { event.preventDefault(); event.returnValue = ''; }
});
function clearPrivateForm() {
    setupVersion++; formOwner = null; editVersion = null; existingPhotoPath = null; dirty = false;
    reportForm.reset(); clearPhoto(); existingPhoto.replaceChildren(); updateContactFields(); updateDescriptionCount();
    reportFields.disabled = true;
    document.getElementById('report-success').hidden = true;
    reportForm.hidden = false;
    reportNotice('Please log in again to continue.');
    document.getElementById('report-login').hidden = false;
    retrySetup.hidden = false;
}
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && formOwner && session?.user?.id !== formOwner)) clearPrivateForm();
});
window.addEventListener('pagehide', clearPrivateForm);
window.addEventListener('pageshow', event => { if (event.persisted) prepareReport(); });
prepareReport();
