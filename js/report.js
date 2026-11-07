const reportForm = document.getElementById('report-form');
const reportFields = document.getElementById('report-fields');
const reportMessage = document.getElementById('report-message');
const categorySelect = document.getElementById('category');
const dateInput = document.getElementById('event-date');
const retrySetup = document.getElementById('report-retry');
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
    document.getElementById('remove-photo').hidden = true;
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
        previewUrl = URL.createObjectURL(blob);
        photoPreview.src = previewUrl;
        photoPreview.hidden = false;
        document.getElementById('remove-photo').hidden = false;
        photoMessage.textContent = `${file.name} · Ready to upload (${Math.ceil(blob.size / 1024)} KB)`;
    } catch (error) {
        if (version === photoVersion) photoMessage.textContent = error.message;
    } finally { if (version === photoVersion) preparingPhoto = false; }
});
document.getElementById('remove-photo').addEventListener('click', () => { clearPhoto(); preparingPhoto = false; });

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
    retrySetup.hidden = true;
    reportFields.disabled = true;
    document.getElementById('report-login').hidden = true;
    reportNotice('Checking your account…');
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (!data?.user) {
            reportNotice('Please log in before reporting an item.');
            document.getElementById('report-login').hidden = false;
            retrySetup.hidden = false;
            return;
        }
        if (error) throw error;
        const { data: categories, error: categoryError } = await window.supabaseClient
            .from('categories').select('id,name').order('name');
        if (categoryError) throw categoryError;
        if (!categories?.length) throw new Error('No categories are available. Please contact the administrator.');
        categorySelect.replaceChildren(new Option('Choose a category', ''));
        categories.forEach(category => categorySelect.add(new Option(category.name, category.id)));
        reportFields.disabled = false;
        reportNotice('The photo and contact details are optional. All other fields are required.');
    } catch (error) {
        reportNotice(`Could not prepare the form: ${error.message}`, 'error');
        retrySetup.hidden = false;
    }
}

reportForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !reportForm.reportValidity()) return;
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
    reportFields.disabled = true;
    reportNotice('Submitting your report…');
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error || !data?.user) {
            document.getElementById('report-login').hidden = false;
            throw new Error('Your session could not be verified. Log in again, then return to this form.');
        }
        if (contact && !window.reportContact.eligible(data.user)) throw new Error('A confirmed @pcu.edu.ph account is required to share contact details.');
        let photoPath = null;
        if (selectedPhoto) {
            reportNotice('Uploading your photo…');
            photoPath = await window.reportPhotos.upload(selectedPhoto, data.user.id);
        }
        reportNotice('Saving your report…');
        const { error: insertError } = await window.reportContact.submit({
            user_id: data.user.id,
            category_id: Number(categorySelect.value),
            title, description, location,
            item_type: itemType,
            event_date: dateInput.value,
            status: 'pending',
            image_url: photoPath
        }, contact, contactConsent.checked);
        if (insertError) {
            if (contact && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(insertError.code)) {
                throw new Error('Contact sharing is not set up yet. Ask the administrator to run report-contacts.sql, or submit without contact details');
            }
            throw insertError;
        }
        reportForm.reset();
        updateContactFields();
        updateDescriptionCount();
        clearPhoto();
        reportForm.hidden = true;
        document.getElementById('report-success').hidden = false;
        reportNotice('Report submitted successfully!', 'success');
    } catch (error) {
        reportNotice(`Submission could not be confirmed: ${error.message}. Your entries have been kept. If the connection dropped, check with the administrator before resubmitting to avoid duplicates.`, 'error');
    } finally {
        submitting = false;
        reportFields.disabled = false;
    }
});

retrySetup.addEventListener('click', prepareReport);
document.getElementById('report-another').addEventListener('click', () => {
    document.getElementById('report-success').hidden = true;
    reportForm.hidden = false;
    prepareReport();
});
prepareReport();
