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

    const BUCKET = "kyc-documents";
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const ALLOWED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ];

    let currentUser = null;
    let loading = false;
    let latestSubmission = null;

    function showMessage(text, type = "") {
        message.textContent = text;
        message.className = "kyc-message";
        if (type) message.classList.add(type);
    }

    function setLoading(value) {
        loading = value;
        submitButton.disabled = value;
        submitButton.textContent = value
            ? "Submitting..."
            : "Submit KYC Document";
    }

    function setStatus(status, createdAt) {
        const safeStatus = ["pending", "approved", "rejected"].includes(status)
            ? status
            : "pending";

        statusBadge.textContent =
            safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1);

        statusBadge.className = "kyc-status-badge " + safeStatus;

        statusDate.textContent = createdAt
            ? "Submitted: " + new Date(createdAt).toLocaleString()
            : "No KYC application submitted yet.";
    }

    function showUploadForm(visible) {
        form.hidden = !visible;
        typeInput.disabled = !visible;
        fileInput.disabled = !visible;
        submitButton.disabled = !visible || loading;
    }

    async function loadKYC() {
        if (!currentUser) return;

        showMessage("Loading your KYC information...");

        const { data, error } = await client
            .from("kyc_submissions")
            .select("id, document_type, document_name, status, admin_notes, created_at")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) {
            console.error("KYC loading error:", error);
            showUploadForm(false);
            showMessage("Unable to load KYC information: " + error.message, "error");
            return;
        }

        latestSubmission = data && data.length ? data[0] : null;

        if (!latestSubmission) {
            setStatus("pending", null);
            notesBox.hidden = true;
            showUploadForm(true);
            showMessage("No document submitted yet. You can start your identity verification.");
            return;
        }

        setStatus(latestSubmission.status, latestSubmission.created_at);

        if (latestSubmission.status === "rejected" && latestSubmission.admin_notes) {
            notesText.textContent = latestSubmission.admin_notes;
            notesBox.hidden = false;
        } else {
            notesBox.hidden = true;
        }

        if (latestSubmission.status === "pending") {
            showUploadForm(false);
            showMessage("Your document has been submitted and is awaiting administrator review.");
        } else if (latestSubmission.status === "approved") {
            showUploadForm(false);
            showMessage("Your identity verification has been approved.", "success");
        } else if (latestSubmission.status === "rejected") {
            showUploadForm(true);
            showMessage("Your application was rejected. Review the administrator's remarks and submit a corrected document.", "error");
        }
    }

    function safeFilename(filename) {
        return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    }

    async function submitKYC(event) {
        event.preventDefault();

        if (loading) return;

        if (!currentUser) {
            showMessage("Please sign in before submitting KYC.", "error");
            return;
        }

        if (latestSubmission && latestSubmission.status !== "rejected") {
            showMessage("You already have a submission awaiting review or an approved KYC.", "error");
            return;
        }

        const documentType = typeInput.value;
        const file = fileInput.files && fileInput.files[0];

        if (!documentType || !file) {
            showMessage("Please select a document type and choose a file.", "error");
            return;
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            showMessage("Unsupported file format. Please use JPG, PNG, WebP or PDF.", "error");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showMessage("Your document exceeds the 10 MB file size limit.", "error");
            return;
        }

        setLoading(true);
        showMessage("Uploading your private KYC document...");

        try {
            const uniqueName = crypto.randomUUID() + "-" + safeFilename(file.name);
            const storagePath = currentUser.id + "/" + uniqueName;

            const { error: uploadError } = await client.storage
                .from(BUCKET)
                .upload(storagePath, file, {
                    cacheControl: "3600",
                    contentType: file.type,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { error: insertError } = await client
                .from("kyc_submissions")
                .insert({
                    user_id: currentUser.id,
                    document_type: documentType,
                    document_name: file.name,
                    document_path: storagePath,
                    status: "pending"
                });

            if (insertError) throw insertError;

            form.reset();
            latestSubmission = null;
            showMessage("Your KYC document has been submitted successfully.", "success");
            await loadKYC();

        } catch (error) {
            console.error("KYC submission error:", error);
            showMessage(error.message || "Unable to submit your KYC document.", "error");
        } finally {
            setLoading(false);
        }
    }

    function showSignedOut() {
        currentUser = null;
        latestSubmission = null;
        setStatus("pending", null);
        notesBox.hidden = true;
        showUploadForm(false);
        showMessage("Please sign in to access KYC verification.", "error");
    }

    async function initialize() {
        if (!client) {
            showUploadForm(false);
            showMessage("Supabase is unavailable. Please refresh the page.", "error");
            return;
        }

        try {
            const { data, error } = await client.auth.getUser();

            if (error || !data.user) {
                showSignedOut();
                return;
            }

            currentUser = data.user;
            await loadKYC();

        } catch (error) {
            console.error("KYC initialization error:", error);
            showMessage("Unable to initialize KYC verification.", "error");
        }
    }

    form.addEventListener("submit", submitKYC);

    if (client) {
        client.auth.onAuthStateChange((_event, session) => {
            const nextUser = session?.user || null;

            if (nextUser) {
                currentUser = nextUser;
                loadKYC();
            } else {
                showSignedOut();
            }
        });
    }

    initialize();
})();