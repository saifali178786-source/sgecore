
(() => {
    "use strict";

    const client = typeof sgecoreSupabase !== "undefined"
        ? sgecoreSupabase
        : null;

    const form = document.getElementById("kyc-form");
    const fileInput = document.getElementById("kyc-document-file");
    const typeInput = document.getElementById("kyc-document-type");
    const submitButton = document.getElementById("kyc-submit");
    const message = document.getElementById("kyc-message");
    const statusBadge = document.getElementById("kyc-status-badge");
    const statusDate = document.getElementById("kyc-status-date");
    const notesBox = document.getElementById("kyc-admin-notes");
    const notesText = document.getElementById("kyc-admin-notes-text");

    if (!form || !fileInput || !typeInput || !submitButton) {
        console.error("KYC form elements are missing.");
        return;
    }

    const BUCKET = "kyc-documents";
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    const ALLOWED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ];

    const TWO_SIDED_DOCUMENTS = [
        "nationalid",
        "cnic",
        "nicop",
        "poc",
        "drivinglicence",
        "drivinglicense",
        "driverslicence",
        "driverslicense",
        "residencepermit",
        "voterid"
    ];

    const ONE_SIDED_DOCUMENTS = [
        "passport",
        "birthcertificate",
        "othergovernmentdocument"
    ];

    let currentUser = null;
    let loading = false;
    let latestSubmission = null;
    let uploadFormVisible = false;

    let frontPreviewURL = null;
    let backPreviewURL = null;

    // --------------------------------------------------
    // Add preview and back-side upload interface
    // --------------------------------------------------

    const previewStyles = document.createElement("style");
    previewStyles.id = "sde-kyc-preview-styles";
    previewStyles.textContent = `
        .sde-kyc-preview {
            display: none;
            margin: 12px 0 20px;
            padding: 14px;
            border: 1px solid rgba(217,180,93,.35);
            border-radius: 10px;
            background: rgba(7,17,31,.65);
        }

        .sde-kyc-preview.visible {
            display: block;
        }

        .sde-kyc-preview-title {
            display: block;
            margin-bottom: 10px;
            color: #f0d58c;
            font-weight: 700;
        }

        .sde-kyc-preview img {
            display: block;
            max-width: 100%;
            max-height: 320px;
            margin: 0 auto;
            object-fit: contain;
            border-radius: 6px;
        }

        .sde-kyc-preview iframe {
            display: block;
            width: 100%;
            height: 320px;
            border: 0;
            border-radius: 6px;
            background: #fff;
        }

        .sde-kyc-preview-name {
            display: block;
            margin-top: 10px;
            color: #cbd5e1;
            font-size: 12px;
            overflow-wrap: anywhere;
        }

        .sde-kyc-back-field {
            margin-top: 18px;
        }

        .sde-kyc-back-option {
            display: flex;
            align-items: center;
            gap: 9px;
            margin: 12px 0;
            color: inherit;
            cursor: pointer;
        }

        .sde-kyc-back-option input {
            width: auto;
            margin: 0;
        }

        .sde-kyc-back-upload[hidden],
        .sde-kyc-back-option[hidden] {
            display: none !important;
        }

        .sde-kyc-preview-hint {
            display: block;
            margin-top: 7px;
            color: #aab6c5;
            font-size: 12px;
        }
    `;

    if (!document.getElementById("sde-kyc-preview-styles")) {
        document.head.appendChild(previewStyles);
    }

    function createPreviewPanel(title) {
        const panel = document.createElement("div");
        panel.className = "sde-kyc-preview";

        const heading = document.createElement("strong");
        heading.className = "sde-kyc-preview-title";
        heading.textContent = title;

        const content = document.createElement("div");

        const filename = document.createElement("span");
        filename.className = "sde-kyc-preview-name";

        panel.append(heading, content, filename);

        return {
            panel,
            heading,
            content,
            filename
        };
    }

    const frontPreview = createPreviewPanel("Front Side Preview");

    const backField = document.createElement("div");
    backField.className = "sde-kyc-back-field";

    const optionalBackLabel = document.createElement("label");
    optionalBackLabel.className = "sde-kyc-back-option";

    const optionalBackCheckbox = document.createElement("input");
    optionalBackCheckbox.type = "checkbox";
    optionalBackCheckbox.id = "kyc-has-back";

    const optionalBackText = document.createElement("span");
    optionalBackText.textContent =
        "My document has a back side";

    optionalBackLabel.append(
        optionalBackCheckbox,
        optionalBackText
    );

    const backUpload = document.createElement("div");
    backUpload.className = "sde-kyc-back-upload";

    const backLabel = document.createElement("label");
    backLabel.htmlFor = "kyc-document-back-file";
    backLabel.textContent = "Back Side Document";

    const backInput = document.createElement("input");
    backInput.type = "file";
    backInput.id = "kyc-document-back-file";
    backInput.accept = ".jpg,.jpeg,.png,.webp,.pdf";

    const backHint = document.createElement("small");
    backHint.className = "sde-kyc-preview-hint";
    backHint.textContent =
        "Accepted formats: JPG, PNG, WebP or PDF. Maximum size: 10 MB.";

    backUpload.append(backLabel, backInput, backHint);

    const backPreview = createPreviewPanel("Back Side Preview");

    backField.append(
        optionalBackLabel,
        backUpload,
        backPreview.panel
    );

    fileInput.accept = ".jpg,.jpeg,.png,.webp,.pdf";

    fileInput.insertAdjacentElement(
        "afterend",
        frontPreview.panel
    );

    frontPreview.panel.insertAdjacentElement(
        "afterend",
        backField
    );

    // --------------------------------------------------
    // Document type rules
    // --------------------------------------------------

    function normalizeDocumentType(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    function getDocumentRule() {
        const selectedOption =
            typeInput.options[typeInput.selectedIndex];

        const combined = normalizeDocumentType(
            typeInput.value + " " +
            (selectedOption ? selectedOption.textContent : "")
        );

        if (ONE_SIDED_DOCUMENTS.some(
            item => combined.includes(item)
        )) {
            return "one-sided";
        }

        if (TWO_SIDED_DOCUMENTS.some(
            item => combined.includes(item)
        )) {
            return "two-sided";
        }

        // Other document types may vary by country.
        return "optional";
    }

    function needsBackDocument() {
        const rule = getDocumentRule();

        if (rule === "two-sided") return true;
        if (rule === "one-sided") return false;

        return optionalBackCheckbox.checked;
    }

    function updateBackField() {
        const rule = getDocumentRule();

        backField.hidden =
            !uploadFormVisible || rule === "one-sided";

        optionalBackLabel.hidden = rule !== "optional";

        if (rule === "two-sided") {
            optionalBackCheckbox.checked = true;
        }

        const showBackUpload =
            rule === "two-sided" ||
            (rule === "optional" &&
                optionalBackCheckbox.checked);

        backUpload.hidden = !showBackUpload;

        frontPreview.heading.textContent =
            rule === "one-sided"
                ? "Document Preview"
                : "Front Side Preview";

        if (!showBackUpload) {
            backInput.value = "";
            clearPreview(backPreview, "back");
        }
    }

    // --------------------------------------------------
    // File previews
    // --------------------------------------------------

    function clearPreview(preview, side) {
        if (side === "front" && frontPreviewURL) {
            URL.revokeObjectURL(frontPreviewURL);
            frontPreviewURL = null;
        }

        if (side === "back" && backPreviewURL) {
            URL.revokeObjectURL(backPreviewURL);
            backPreviewURL = null;
        }

        preview.content.replaceChildren();
        preview.filename.textContent = "";
        preview.panel.classList.remove("visible");
    }

    function showFilePreview(file, preview, side) {
        clearPreview(preview, side);

        if (!file) return;

        const objectURL = URL.createObjectURL(file);

        if (side === "front") {
            frontPreviewURL = objectURL;
        } else {
            backPreviewURL = objectURL;
        }

        if (file.type.startsWith("image/")) {
            const image = document.createElement("img");
            image.src = objectURL;
            image.alt = side === "front"
                ? "Selected front-side document"
                : "Selected back-side document";

            preview.content.appendChild(image);

        } else if (file.type === "application/pdf") {
            const pdf = document.createElement("iframe");
            pdf.src = objectURL;
            pdf.title = side === "front"
                ? "Front-side PDF preview"
                : "Back-side PDF preview";

            preview.content.appendChild(pdf);
        }

        preview.filename.textContent = file.name;
        preview.panel.classList.add("visible");
    }

    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];

        showFilePreview(file, frontPreview, "front");
    });

    backInput.addEventListener("change", () => {
        const file = backInput.files && backInput.files[0];

        showFilePreview(file, backPreview, "back");
    });

    typeInput.addEventListener("change", () => {
        optionalBackCheckbox.checked = false;
        backInput.value = "";

        clearPreview(backPreview, "back");
        updateBackField();
    });

    optionalBackCheckbox.addEventListener(
        "change",
        updateBackField
    );

    // --------------------------------------------------
    // Messages and status
    // --------------------------------------------------

    function showMessage(text, type = "") {
        if (!message) return;

        message.textContent = text;
        message.className = "kyc-message";

        if (type) {
            message.classList.add(type);
        }
    }

    function setLoading(value) {
        loading = value;

        submitButton.disabled =
            value || !uploadFormVisible;

        submitButton.textContent = value
            ? "Submitting..."
            : "Submit KYC Document";
    }

    function setStatus(status, createdAt) {
        const safeStatus = [
            "pending",
            "approved",
            "rejected"
        ].includes(status)
            ? status
            : "pending";

        if (statusBadge) {
            statusBadge.textContent =
                safeStatus.charAt(0).toUpperCase() +
                safeStatus.slice(1);

            statusBadge.className =
                "kyc-status-badge " + safeStatus;
        }

        if (statusDate) {
            statusDate.textContent = createdAt
                ? "Submitted: " +
                    new Date(createdAt).toLocaleString()
                : "No KYC application submitted yet.";
        }
    }

    function showUploadForm(visible) {
        uploadFormVisible = visible;

        form.hidden = !visible;
        typeInput.disabled = !visible;
        fileInput.disabled = !visible;
        backInput.disabled = !visible;
        optionalBackCheckbox.disabled = !visible;

        submitButton.disabled = !visible || loading;

        updateBackField();
    }

    // --------------------------------------------------
    // Load customer's KYC information
    // --------------------------------------------------

    async function loadKYC() {
        if (!currentUser) return;

        showMessage("Loading your KYC information...");

        const { data, error } = await client
            .from("kyc_submissions")
            .select(
                "id, document_type, document_name, document_path, document_back_path, status, admin_notes, created_at"
            )
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) {
            console.error("KYC loading error:", error);
            showUploadForm(false);

            showMessage(
                "Unable to load KYC information: " +
                error.message,
                "error"
            );

            return;
        }

        latestSubmission =
            data && data.length ? data[0] : null;

        if (!latestSubmission) {
            setStatus("pending", null);

            if (notesBox) notesBox.hidden = true;

            showUploadForm(true);

            showMessage(
                "No document submitted yet. You can start your identity verification."
            );

            return;
        }

        setStatus(
            latestSubmission.status,
            latestSubmission.created_at
        );

        if (
            latestSubmission.status === "rejected" &&
            latestSubmission.admin_notes
        ) {
            if (notesText) {
                notesText.textContent =
                    latestSubmission.admin_notes;
            }

            if (notesBox) notesBox.hidden = false;

        } else if (notesBox) {
            notesBox.hidden = true;
        }

        if (latestSubmission.status === "pending") {
            showUploadForm(false);

            showMessage(
                "Your document has been submitted and is awaiting administrator review."
            );

        } else if (latestSubmission.status === "approved") {
            showUploadForm(false);

            showMessage(
                "Your identity verification has been approved.",
                "success"
            );

        } else if (latestSubmission.status === "rejected") {
            showUploadForm(true);

            showMessage(
                "Your application was rejected. Review the administrator's remarks and submit a corrected document.",
                "error"
            );
        }
    }

    // --------------------------------------------------
    // File validation and upload
    // --------------------------------------------------

    function safeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(-100);
    }

    function validateFile(file, sideName) {
        if (!file) {
            return sideName + " document is required.";
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return (
                sideName +
                " document has an unsupported format. Use JPG, PNG, WebP or PDF."
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return (
                sideName +
                " document exceeds the 10 MB file size limit."
            );
        }

        return null;
    }

    async function uploadDocument(file, uploadedPaths) {
        const uniqueName =
            crypto.randomUUID() + "-" +
            safeFilename(file.name);

        const storagePath =
            currentUser.id + "/" + uniqueName;

        const { error } = await client.storage
            .from(BUCKET)
            .upload(storagePath, file, {
                cacheControl: "3600",
                contentType: file.type,
                upsert: false
            });

        if (error) throw error;

        uploadedPaths.push(storagePath);

        return storagePath;
    }

    async function submitKYC(event) {
        event.preventDefault();

        if (loading) return;

        if (!currentUser) {
            showMessage(
                "Please sign in before submitting KYC.",
                "error"
            );
            return;
        }

        if (
            latestSubmission &&
            latestSubmission.status !== "rejected"
        ) {
            showMessage(
                "You already have a submission awaiting review or an approved KYC.",
                "error"
            );
            return;
        }

        const documentType = typeInput.value;

        const frontFile =
            fileInput.files && fileInput.files[0];

        const backFile =
            backInput.files && backInput.files[0];

        if (!documentType) {
            showMessage(
                "Please select a document type.",
                "error"
            );
            return;
        }

        const frontError =
            validateFile(frontFile, "Front-side");

        if (frontError) {
            showMessage(frontError, "error");
            return;
        }

        if (needsBackDocument()) {
            const backError =
                validateFile(backFile, "Back-side");

            if (backError) {
                showMessage(backError, "error");
                return;
            }
        }

        const selectedOption =
            typeInput.options[typeInput.selectedIndex];

        const documentName = frontFile.name;

        setLoading(true);

        showMessage(
            "Uploading your private KYC document..."
        );

        const uploadedPaths = [];

        try {
            const frontPath =
                await uploadDocument(
                    frontFile,
                    uploadedPaths
                );

            let backPath = null;

            if (needsBackDocument()) {
                backPath = await uploadDocument(
                    backFile,
                    uploadedPaths
                );
            }

            const { error: insertError } = await client
                .from("kyc_submissions")
                .insert({
                    user_id: currentUser.id,
                    document_type: documentType,
                    document_name: documentName,
                    document_path: frontPath,
                    document_back_path: backPath,
                    status: "pending"
                });

            if (insertError) throw insertError;

            form.reset();

            clearPreview(frontPreview, "front");
            clearPreview(backPreview, "back");

            optionalBackCheckbox.checked = false;
            updateBackField();

            latestSubmission = null;

            showMessage(
                "Your KYC document has been submitted successfully.",
                "success"
            );

            await loadKYC();

        } catch (error) {
            console.error("KYC submission error:", error);

            // Remove newly uploaded files if submission fails.
            if (uploadedPaths.length) {
                const { error: cleanupError } =
                    await client.storage
                        .from(BUCKET)
                        .remove(uploadedPaths);

                if (cleanupError) {
                    console.error(
                        "KYC upload cleanup error:",
                        cleanupError
                    );
                }
            }

            showMessage(
                error.message ||
                "Unable to submit your KYC document.",
                "error"
            );

        } finally {
            setLoading(false);
        }
    }

    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    function showSignedOut() {
        currentUser = null;
        latestSubmission = null;

        setStatus("pending", null);

        if (notesBox) notesBox.hidden = true;

        showUploadForm(false);

        showMessage(
            "Please sign in to access KYC verification.",
            "error"
        );
    }

    async function initialize() {
        if (!client) {
            showUploadForm(false);

            showMessage(
                "Supabase is unavailable. Please refresh the page.",
                "error"
            );

            return;
        }

        try {
            const { data, error } =
                await client.auth.getUser();

            if (error || !data.user) {
                showSignedOut();
                return;
            }

            currentUser = data.user;

            await loadKYC();

        } catch (error) {
            console.error(
                "KYC initialization error:",
                error
            );

            showMessage(
                "Unable to initialize KYC verification.",
                "error"
            );
        }
    }

    form.addEventListener("submit", submitKYC);

    client?.auth.onAuthStateChange(
        (_event, session) => {
            const nextUser = session?.user || null;

            if (nextUser) {
                currentUser = nextUser;
                loadKYC();
            } else {
                showSignedOut();
            }
        }
    );

    updateBackField();
    initialize();
})();
